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
		'https://www.endurance-tms.com/wp-json/tms/v1/drivers';
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
		totalSkipped: number;
		duplicateEmails: number[];
		totalPages: number;
		pagesProcessed: number;
		hasMorePages: boolean;
	}> {
		this.logger.log(
			`Starting import process: page=${page}, per_page=${per_page}, search=${search || 'none'}`,
		);

		let totalImported = 0;
		let totalUpdated = 0;
		let totalSkipped = 0;
		const duplicateEmails: number[] = [];
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

				console.log('response++++', response);

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
					duplicateEmails,
				);
				totalImported += batchResults.imported;
				totalUpdated += batchResults.updated;
				totalSkipped += batchResults.skipped;
				pagesProcessed++;

				this.logger.log(
					`Page ${currentPage} processed: ${batchResults.imported} imported, ${batchResults.updated} updated, ${batchResults.skipped} skipped`,
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
				`Import session completed: ${totalImported} imported, ${totalUpdated} updated, ${totalSkipped} skipped, ${pagesProcessed} pages processed`,
			);

			const duplicateMessage =
				duplicateEmails.length > 0
					? ` Duplicate emails found for drivers: ${duplicateEmails.join(', ')}`
					: '';

			return {
				message: `Import session completed. Imported: ${totalImported}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}, Pages processed: ${pagesProcessed}${hasMorePages ? '. More pages available.' : ''}${duplicateMessage}`,
				totalImported,
				totalUpdated,
				totalSkipped,
				duplicateEmails,
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
	 * Process a batch of drivers individually to avoid transaction issues
	 */
	private async processDriversBatch(
		drivers: ExternalDriver[],
		duplicateEmails: number[],
	): Promise<{ imported: number; updated: number; skipped: number }> {
		let imported = 0;
		let updated = 0;
		let skipped = 0;

		// Process drivers individually to avoid transaction conflicts
		for (const driver of drivers) {
			try {
				const result = await this.processDriver(
					driver,
					duplicateEmails,
				);
				if (result === 'imported') {
					imported++;
				} else if (result === 'updated') {
					updated++;
				} else if (result === 'skipped') {
					skipped++;
				}
			} catch (error) {
				this.logger.error(
					`Failed to process driver ${driver.id}:`,
					error,
				);
				// Continue with other drivers even if one fails
			}

			// Small delay between drivers to avoid overwhelming the database
			await this.delay(50);
		}

		return { imported, updated, skipped };
	}

	/**
	 * Process a single driver
	 */
	private async processDriver(
		driver: ExternalDriver,
		duplicateEmails: number[],
	): Promise<'imported' | 'updated' | 'skipped'> {
		// Split driver_name into firstName and lastName
		const driverName = driver.driver_name || '';
		const nameParts = driverName.trim().split(' ');
		const firstName = nameParts[0] || '';
		const lastName = nameParts.slice(1).join(' ') || '';

		// Parse coordinates - handle empty strings and invalid values
		const parseCoordinate = (value: string | undefined): number | null => {
			if (!value || value.trim() === '') return null;
			const parsed = parseFloat(value);
			return isNaN(parsed) ? null : parsed;
		};

		const userData = {
			externalId: driver.id.toString(),
			email: driver.driver_email || '',
			firstName: firstName,
			lastName: lastName,
			phone: driver.driver_phone || '',
			location: driver.home_location || '',
			type: driver.type || '',
			vin: driver.vin || '',
			driverStatus: driver.driver_status || null,
			latitude: parseCoordinate(driver.latitude),
			longitude: parseCoordinate(driver.longitude),
			role: UserRole.DRIVER,
			status: UserStatus.INACTIVE, // Default status for imported users
			password: null, // No password for imported users
		};

		// Check if user exists by externalId only
		const existingUser = await this.prisma.user.findUnique({
			where: { externalId: driver.id.toString() },
		});

		if (existingUser) {
			// User exists - update all fields including email
			await this.prisma.user.update({
				where: { id: existingUser.id },
				data: {
					email: userData.email,  // Обновляем email
					firstName: userData.firstName,
					lastName: userData.lastName,
					phone: userData.phone,
					location: userData.location,
					type: userData.type,
					vin: userData.vin,
					driverStatus: userData.driverStatus,
					latitude: userData.latitude,
					longitude: userData.longitude,
					role: userData.role,
					status: userData.status,
					password: userData.password,
				},
			});
			this.logger.log(`Updated driver ${driver.id} (externalId: ${driver.id.toString()}) with driverStatus: ${userData.driverStatus}, latitude: ${userData.latitude}, longitude: ${userData.longitude}`);
			return 'updated';
		} else {
			// User doesn't exist - check if email is already taken
			const userWithSameEmail = await this.prisma.user.findUnique({
				where: { email: driver.driver_email.trim() },
			});

			if (userWithSameEmail) {
				// Email already exists - add to duplicates list and skip
				duplicateEmails.push(driver.id);
				this.logger.warn(
					`Skipping driver ${driver.id} - email ${driver.driver_email} already exists for user ${userWithSameEmail.id}`,
				);
				return 'skipped';
			}

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
