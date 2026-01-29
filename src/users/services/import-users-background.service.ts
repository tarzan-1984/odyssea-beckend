import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
	ExternalUser,
	ExternalUserApiResponse,
} from '../interfaces/external-user.interface';
import { UserRole, UserStatus } from '@prisma/client';
import axios from 'axios';
import { logImportDuplicate } from './import-duplicate-logger';

export interface ImportUserJobData {
	page: number;
	per_page: number;
	search?: string;
	jobId: string;
}

export interface ImportUserJobResult {
	imported: number;
	updated: number;
	skipped: number;
	duplicateEmails: number[];
	page: number;
	hasMorePages: boolean;
}

interface ImportUserJob {
	id: string;
	status: 'processing' | 'completed' | 'failed';
	progress: number;
	processedPages: number;
	totalImported: number;
	totalUpdated: number;
	totalSkipped: number;
	duplicateEmails: number[];
	isComplete: boolean;
	startTime: Date;
	endTime?: Date;
	error?: string;
}

@Injectable()
export class ImportUsersBackgroundService {
	private readonly logger = new Logger(ImportUsersBackgroundService.name);
	private readonly EXTERNAL_API_URL =
		'https://www.endurance-tms.com/wp-json/tms/v1/users';
	private readonly API_KEY = 'tms_api_key_2024_driver_access';
	private readonly REQUEST_TIMEOUT = 60000; // 60 seconds
	private readonly MAX_PAGES_PER_REQUEST = 5; // Conservative limit to prevent timeouts
	private jobs = new Map<string, ImportUserJob>();

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
	 * Start import process in background
	 */
	async startImport(
		page: number,
		per_page: number,
		search?: string,
	): Promise<{ jobId: string; message: string }> {
		const jobId = `import-users-${Date.now()}`;

		// Create job record
		this.jobs.set(jobId, {
			id: jobId,
			status: 'processing',
			progress: 0,
			processedPages: 0,
			totalImported: 0,
			totalUpdated: 0,
			totalSkipped: 0,
			duplicateEmails: [],
			isComplete: false,
			startTime: new Date(),
		});

		// Start background processing (non-blocking)
		this.processImportInBackground(jobId, page, per_page, search).catch(
			(error) => {
				this.logger.error(
					`Background import failed for job ${jobId}:`,
					error,
				);
				const job = this.jobs.get(jobId);
				if (job) {
					job.status = 'failed';
					job.error = error.message;
					job.isComplete = true;
					job.endTime = new Date();
				}
			},
		);

		return {
			jobId,
			message: `Background import process started. Job ID: ${jobId}. Check status at /v1/users/import-users-status/${jobId}`,
		};
	}

	/**
	 * Get import job status
	 */
	async getImportStatus(jobId: string): Promise<{
		status: string;
		progress: number;
		processedPages: number;
		totalImported: number;
		totalUpdated: number;
		totalSkipped: number;
		duplicateEmails: number[];
		isComplete: boolean;
		error?: string;
		startTime: Date;
		endTime?: Date;
	}> {
		const job = this.jobs.get(jobId);

		if (!job) {
			throw new Error(`Job ${jobId} not found`);
		}

		return {
			status: job.status,
			progress: job.progress,
			processedPages: job.processedPages,
			totalImported: job.totalImported,
			totalUpdated: job.totalUpdated,
			totalSkipped: job.totalSkipped,
			duplicateEmails: job.duplicateEmails,
			isComplete: job.isComplete,
			error: job.error,
			startTime: job.startTime,
			endTime: job.endTime,
		};
	}

	/**
	 * Process import in background
	 */
	private async processImportInBackground(
		jobId: string,
		startPage: number,
		per_page: number,
		search?: string,
	): Promise<void> {
		let currentPage = startPage;
		let totalImported = 0;
		let totalUpdated = 0;
		let totalSkipped = 0;
		const duplicateEmails: number[] = [];
		let processedPages = 0;

		try {
			while (true) {
				this.logger.log(
					`Processing page ${currentPage} for job ${jobId}`,
				);

				// Update job progress
				const job = this.jobs.get(jobId);
				if (job) {
					job.processedPages = processedPages;
					job.totalImported = totalImported;
					job.totalUpdated = totalUpdated;
					job.totalSkipped = totalSkipped;
					job.duplicateEmails = [...duplicateEmails];
				}

				// Fetch data from external API
				const response = await this.fetchExternalUsers(
					currentPage,
					per_page,
					search,
				);

				if (!response.success) {
					throw new Error(
						'External API returned unsuccessful response',
					);
				}

				// Process users
				const result = await this.processUsersBatch(
					response.data,
					duplicateEmails,
				);
				totalImported += result.imported;
				totalUpdated += result.updated;
				totalSkipped += result.skipped;
				processedPages++;

				this.logger.log(
					`Page ${currentPage} processed: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`,
				);

				// Update job progress
				if (job) {
					job.processedPages = processedPages;
					job.totalImported = totalImported;
					job.totalUpdated = totalUpdated;
					job.totalSkipped = totalSkipped;
					job.duplicateEmails = [...duplicateEmails];
					job.progress = Math.min(
						100,
						(processedPages /
							Math.max(1, response.pagination.total_pages)) *
							100,
					);
				}

				// Check if there are more pages
				if (currentPage >= response.pagination.total_pages) {
					break;
				}

				// Check if we've reached the limit
				if (processedPages >= this.MAX_PAGES_PER_REQUEST) {
					break;
				}

				currentPage++;
				await this.delay(1000); // Delay between page requests
			}

			// Mark job as completed
			const job = this.jobs.get(jobId);
			if (job) {
				job.status = 'completed';
				job.progress = 100;
				job.isComplete = true;
				job.endTime = new Date();
			}

			this.logger.log(
				`Background import completed for job ${jobId}: ${totalImported} imported, ${totalUpdated} updated, ${totalSkipped} skipped`,
			);
		} catch (error) {
			this.logger.error(`Background import job ${jobId} failed:`, error);
			const job = this.jobs.get(jobId);
			if (job) {
				job.status = 'failed';
				job.error = error.message;
				job.isComplete = true;
				job.endTime = new Date();
			}
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
			throw new Error(
				`Failed to fetch users from external API: ${error.message}`,
			);
		}
	}

	/**
	 * Process a batch of users
	 */
	private async processUsersBatch(
		users: ExternalUser[],
		duplicateEmails: number[],
	): Promise<{ imported: number; updated: number; skipped: number }> {
		let imported = 0;
		let updated = 0;
		let skipped = 0;

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
				this.logger.error(`Failed to process user ${user.id}:`, error);
			}

			// Small delay between users
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
			status: UserStatus.INACTIVE,
			password: null,
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
				logImportDuplicate(
					user.id.toString(),
					userWithSameEmail.id,
					user.user_email.trim(),
				);
				this.logger.warn(
					`Skipping user ${user.id} - email ${user.user_email} already exists for user ${userWithSameEmail.id}`,
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
