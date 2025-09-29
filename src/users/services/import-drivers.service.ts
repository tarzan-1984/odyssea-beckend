import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
	ExternalDriver,
	ExternalApiResponse,
} from '../interfaces/external-driver.interface';
import { UserRole, UserStatus } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class ImportDriversService {
	private readonly logger = new Logger(ImportDriversService.name);
	private readonly EXTERNAL_API_URL =
		'https://www.endurance-tms.com/wp-json/tms/v1/users';
	private readonly API_KEY = 'tms_api_key_2024_driver_access';
	private readonly REQUEST_TIMEOUT = 60000; // 60 seconds - increased for safety
	private readonly BATCH_SIZE = 15; // Optimal batch size for database performance
	private readonly MAX_PAGES_PER_REQUEST = 5; // Conservative limit to prevent timeouts

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Import drivers from external API with pagination
	 * Limited to prevent timeouts - processes max MAX_PAGES_PER_REQUEST pages
	 */
	async importDrivers(
		page: number,
		per_page: number,
		search?: string,
	): Promise<{
		message: string;
		totalImported: number;
		totalUpdated: number;
		totalPages: number;
		pagesProcessed: number;
		hasMorePages: boolean;
	}> {
		this.logger.log(
			`Starting import process: page=${page}, per_page=${per_page}, search=${search || 'none'}`,
		);

		let totalImported = 0;
		let totalUpdated = 0;
		let currentPage = page;
		let totalPages = 0;
		let pagesProcessed = 0;
		let hasMorePages = false;

		try {
			do {
				this.logger.log(`Processing page ${currentPage}...`);

				// Fetch data from external API
				const response = await this.fetchExternalDrivers(
					currentPage,
					per_page,
					search,
				);

				if (!response.success) {
					throw new BadRequestException(
						'External API returned unsuccessful response',
					);
				}

				totalPages = response.pagination.total_pages;
				hasMorePages = response.pagination.has_next_page;

				// Process drivers in batches to avoid memory issues
				const batchResults = await this.processDriversBatch(
					response.data,
				);
				totalImported += batchResults.imported;
				totalUpdated += batchResults.updated;
				pagesProcessed++;

				this.logger.log(
					`Page ${currentPage} processed: ${batchResults.imported} imported, ${batchResults.updated} updated`,
				);

				// Check if we've reached the limit or no more pages
				if (
					!response.pagination.has_next_page ||
					pagesProcessed >= this.MAX_PAGES_PER_REQUEST
				) {
					break;
				}

				currentPage++;

				// Add a small delay between requests to avoid overwhelming the external API
				await this.delay(1000);
			} while (
				currentPage <= totalPages &&
				pagesProcessed < this.MAX_PAGES_PER_REQUEST
			);

			this.logger.log(
				`Import session completed: ${totalImported} imported, ${totalUpdated} updated, ${pagesProcessed} pages processed`,
			);

			return {
				message: `Import session completed. Imported: ${totalImported}, Updated: ${totalUpdated}, Pages processed: ${pagesProcessed}${hasMorePages ? '. More pages available.' : ''}`,
				totalImported,
				totalUpdated,
				totalPages,
				pagesProcessed,
				hasMorePages,
			};
		} catch (error) {
			this.logger.error(`Import failed at page ${currentPage}:`, error);
			throw new BadRequestException(`Import failed: ${error.message}`);
		}
	}

	/**
	 * Fetch drivers from external API
	 */
	private async fetchExternalDrivers(
		page: number,
		per_page: number,
		search?: string,
	): Promise<ExternalApiResponse> {
		const params = new URLSearchParams({
			page: page.toString(),
			per_page: per_page.toString(),
		});

		if (search) {
			params.append('search', search);
		}

		const url = `${this.EXTERNAL_API_URL}?${params.toString()}`;

		try {
			const response = await axios.get<ExternalApiResponse>(url, {
				headers: {
					'X-API-Key': this.API_KEY,
				},
				timeout: this.REQUEST_TIMEOUT,
			});

			return response.data;
		} catch (error) {
			this.logger.error(`Failed to fetch external drivers:`, error);
			throw new BadRequestException(
				`Failed to fetch drivers from external API: ${error.message}`,
			);
		}
	}

	/**
	 * Process a batch of drivers using database transactions for better performance
	 */
	private async processDriversBatch(
		drivers: ExternalDriver[],
	): Promise<{ imported: number; updated: number }> {
		let imported = 0;
		let updated = 0;

		// Process in smaller batches to avoid database timeout
		for (let i = 0; i < drivers.length; i += this.BATCH_SIZE) {
			const batch = drivers.slice(i, i + this.BATCH_SIZE);

			// Use transaction for each batch to ensure consistency
			try {
				await this.prisma.$transaction(async (tx) => {
					for (const driver of batch) {
						try {
							const result =
								await this.processDriverInTransaction(
									driver,
									tx,
								);
							if (result === 'imported') {
								imported++;
							} else if (result === 'updated') {
								updated++;
							}
						} catch (error) {
							this.logger.error(
								`Failed to process driver ${driver.id}:`,
								error,
							);
							// Continue with other drivers even if one fails
						}
					}
				});
			} catch (error) {
				this.logger.error(
					`Transaction failed for batch starting at index ${i}:`,
					error,
				);
				// Process drivers individually if transaction fails
				for (const driver of batch) {
					try {
						const result = await this.processDriver(driver);
						if (result === 'imported') {
							imported++;
						} else if (result === 'updated') {
							updated++;
						}
					} catch (driverError) {
						this.logger.error(
							`Failed to process driver ${driver.id}:`,
							driverError,
						);
					}
				}
			}

			// Small delay between batches
			await this.delay(100);
		}

		return { imported, updated };
	}

	/**
	 * Process a single driver within a transaction
	 */
	private async processDriverInTransaction(
		driver: ExternalDriver,
		tx: any,
	): Promise<'imported' | 'updated' | 'skipped'> {
		// Check if user exists by externalId or email
		const existingUser = await tx.user.findFirst({
			where: {
				OR: [
					{ externalId: driver.id.toString() },
					{ email: driver.driver_email },
				],
			},
		});

		// Split driver_name into firstName and lastName
		const nameParts = driver.driver_name.trim().split(' ');
		const firstName = nameParts[0] || '';
		const lastName = nameParts.slice(1).join(' ') || '';

		const userData = {
			externalId: driver.id.toString(),
			email: driver.driver_email,
			firstName: firstName,
			lastName: lastName,
			phone: driver.driver_phone,
			location: driver.home_location,
			type: driver.type,
			vin: driver.vin,
			role: UserRole.DRIVER,
			status: UserStatus.INACTIVE, // Default status for imported users
			password: null, // No password for imported users
		};

		if (existingUser) {
			// Update existing user
			await tx.user.update({
				where: { id: existingUser.id },
				data: {
					...userData,
					// Don't update email if it's different (to avoid conflicts)
					email: existingUser.email,
				},
			});
			return 'updated';
		} else {
			// Create new user
			await tx.user.create({
				data: userData,
			});
			return 'imported';
		}
	}

	/**
	 * Process a single driver
	 */
	private async processDriver(
		driver: ExternalDriver,
	): Promise<'imported' | 'updated' | 'skipped'> {
		// Check if user exists by externalId or email
		const existingUser = await this.prisma.user.findFirst({
			where: {
				OR: [
					{ externalId: driver.id.toString() },
					{ email: driver.driver_email },
				],
			},
		});

		// Split driver_name into firstName and lastName
		const nameParts = driver.driver_name.trim().split(' ');
		const firstName = nameParts[0] || '';
		const lastName = nameParts.slice(1).join(' ') || '';

		const userData = {
			externalId: driver.id.toString(),
			email: driver.driver_email,
			firstName: firstName,
			lastName: lastName,
			phone: driver.driver_phone,
			location: driver.home_location,
			type: driver.type,
			vin: driver.vin,
			role: UserRole.DRIVER,
			status: UserStatus.INACTIVE, // Default status for imported users
			password: null, // No password for imported users
		};

		if (existingUser) {
			// Update existing user
			await this.prisma.user.update({
				where: { id: existingUser.id },
				data: {
					...userData,
					// Don't update email if it's different (to avoid conflicts)
					email: existingUser.email,
				},
			});
			return 'updated';
		} else {
			// Create new user
			await this.prisma.user.create({
				data: userData,
			});
			return 'imported';
		}
	}

	/**
	 * Utility function to add delay
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
