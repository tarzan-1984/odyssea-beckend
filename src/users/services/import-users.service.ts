import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
	ExternalUser,
	ExternalUserApiResponse,
} from '../interfaces/external-user.interface';
import { UserRole, UserStatus } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class ImportUsersService {
	private readonly logger = new Logger(ImportUsersService.name);
	private readonly EXTERNAL_API_URL =
		'https://www.endurance-tms.com/wp-json/tms/v1/users';
	private readonly API_KEY = 'tms_api_key_2024_driver_access';
	private readonly REQUEST_TIMEOUT = 60000; // 60 seconds - increased for safety
	private readonly BATCH_SIZE = 15; // Optimal batch size for database performance
	private readonly MAX_PAGES_PER_REQUEST = 5; // Conservative limit to prevent timeouts

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Normalize permission_view to our allowed company values.
	 */
	private normalizeCompany(value?: string[] | null): string[] {
		if (!Array.isArray(value) || value.length === 0) return [];
		const allowedMap = new Map<string, 'Odysseia' | 'Martlet' | 'Endurance'>([
			['odysseia', 'Odysseia'],
			['martlet', 'Martlet'],
			['endurance', 'Endurance'],
		]);
		const normalized: Array<'Odysseia' | 'Martlet' | 'Endurance'> = [];
		for (const item of value) {
			if (typeof item !== 'string') continue;
			const canon = allowedMap.get(item.trim().toLowerCase());
			if (!canon) continue;
			if (!normalized.includes(canon)) normalized.push(canon);
		}
		return normalized;
	}

	/**
	 * Import users from external API with pagination
	 * Limited to prevent timeouts - processes max MAX_PAGES_PER_REQUEST pages
	 */
	async importUsers(
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
				const response = await this.fetchExternalUsers(
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
				hasMorePages = currentPage < totalPages;

				// Process users in batches to avoid memory issues
				const batchResults = await this.processUsersBatch(
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
					!hasMorePages ||
					pagesProcessed >= this.MAX_PAGES_PER_REQUEST
				) {
					break;
				}

				currentPage++;
				await this.delay(1000); // Delay between page requests

			} while (
				currentPage <= totalPages &&
				pagesProcessed < this.MAX_PAGES_PER_REQUEST
			);

			this.logger.log(
				`Import session completed: ${totalImported} imported, ${totalUpdated} updated, ${totalSkipped} skipped, ${pagesProcessed} pages processed`,
			);

			const duplicateMessage = duplicateEmails.length > 0 
				? ` Duplicate emails found for users: ${duplicateEmails.join(', ')}`
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
	 * Fetch users from external API
	 */
	private async fetchExternalUsers(
		page: number,
		per_page: number,
		search?: string,
	): Promise<ExternalUserApiResponse> {
		const params = new URLSearchParams({
			page: page.toString(),
			per_page: per_page.toString(),
		});

		if (search) {
			params.append('search', search);
		}

		const url = `${this.EXTERNAL_API_URL}?${params.toString()}`;

		try {
			const response = await axios.get<ExternalUserApiResponse>(url, {
				headers: {
					'X-API-Key': this.API_KEY,
				},
				timeout: this.REQUEST_TIMEOUT,
			});
			return response.data;
		} catch (error) {
			this.logger.error(`Failed to fetch external users:`, error);
			throw new BadRequestException(
				`Failed to fetch users from external API: ${error.message}`,
			);
		}
	}

	/**
	 * Process a batch of users individually to avoid transaction issues
	 */
	private async processUsersBatch(
		users: ExternalUser[],
		duplicateEmails: number[],
	): Promise<{ imported: number; updated: number; skipped: number }> {
		let imported = 0;
		let updated = 0;
		let skipped = 0;

		// Process users individually to avoid transaction conflicts
		for (const user of users) {
			try {
				const result = await this.processUser(user, duplicateEmails);
				if (result === 'imported') {
					imported++;
				} else if (result === 'updated') {
					updated++;
				} else if (result === 'skipped') {
					skipped++;
				}
			} catch (error) {
				this.logger.error(
					`Failed to process user ${user.id}:`,
					error,
				);
				// Continue with other users even if one fails
			}

			// Small delay between users to avoid overwhelming the database
			await this.delay(50);
		}

		return { imported, updated, skipped };
	}

	/**
	 * Process a single user
	 */
	private async processUser(
		user: ExternalUser,
		duplicateEmails: number[],
	): Promise<'imported' | 'updated' | 'skipped'> {
		// Skip if no email provided
		if (!user.user_email || user.user_email.trim() === '') {
			this.logger.warn(`Skipping user ${user.id} - no email provided`);
			return 'skipped';
		}

		// Map roles to UserRole enum
		const mappedRole = this.mapRoleToUserRole(user.roles);

		const permissionView = user.acf_fields?.permission_view ?? [];

		const userData = {
			externalId: user.id.toString(),
			email: user.user_email.trim(),
			firstName: user.first_name || '',
			lastName: user.last_name || '',
			phone: user.acf_fields?.phone_number || '',
			location: user.acf_fields?.work_location || '',
			company: this.normalizeCompany(permissionView),
			role: mappedRole,
			status: UserStatus.INACTIVE, // Default status for imported users
			password: null, // No password for imported users
		};

		// Check if user exists by externalId only
		const existingUser = await this.prisma.user.findUnique({
			where: { externalId: user.id.toString() },
		});

		if (existingUser) {
			// User exists - update all fields except email (keep original email)
			await this.prisma.user.update({
				where: { id: existingUser.id },
				data: {
					firstName: userData.firstName,
					lastName: userData.lastName,
					phone: userData.phone,
					location: userData.location,
					company: userData.company,
					role: userData.role,
					// Do not overwrite status, password, or profilePhoto for existing users.
				},
			});
			return 'updated';
		} else {
			// User doesn't exist - check if email is already taken
			const userWithSameEmail = await this.prisma.user.findUnique({
				where: { email: user.user_email.trim() },
			});

			if (userWithSameEmail) {
				// Email already exists - add to duplicates list and skip
				duplicateEmails.push(user.id);
				this.logger.warn(`Skipping user ${user.id} - email ${user.user_email} already exists for user ${userWithSameEmail.id}`);
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
	 * Map external roles to internal UserRole enum
	 */
	private mapRoleToUserRole(externalRoles: string[]): UserRole {
		// Priority mapping based on role hierarchy
		if (externalRoles.includes('administrator')) {
			return UserRole.ADMINISTRATOR;
		}
		if (externalRoles.includes('moderator')) {
			return UserRole.MODERATOR;
		}
		if (externalRoles.includes('dispatcher')) {
			return UserRole.DISPATCHER;
		}
		if (externalRoles.includes('dispatcher-tl')) {
			return UserRole.DISPATCHER_TL;
		}
		if (externalRoles.includes('recruiter')) {
			return UserRole.RECRUITER;
		}
		if (externalRoles.includes('recruiter-tl')) {
			return UserRole.RECRUITER_TL;
		}
		if (externalRoles.includes('driver')) {
			return UserRole.DRIVER;
		}
		if (externalRoles.includes('driver_updates')) {
			return UserRole.DRIVER_UPDATES;
		}
		if (externalRoles.includes('tracking')) {
			return UserRole.TRACKING;
		}
		if (externalRoles.includes('tracking-tl')) {
			return UserRole.TRACKING_TL;
		}
		if (externalRoles.includes('morning_tracking')) {
			return UserRole.MORNING_TRACKING;
		}
		if (externalRoles.includes('nightshift_tracking')) {
			return UserRole.NIGHTSHIFT_TRACKING;
		}
		if (externalRoles.includes('expedite_manager')) {
			return UserRole.EXPEDITE_MANAGER;
		}
		if (externalRoles.includes('accounting')) {
			return UserRole.ACCOUNTING;
		}
		if (externalRoles.includes('billing')) {
			return UserRole.BILLING;
		}
		if (externalRoles.includes('subscriber')) {
			return UserRole.SUBSCRIBER;
		}
		
		// Default role for unknown roles
		return UserRole.DRIVER;
	}

	/**
	 * Utility function to add delay
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
