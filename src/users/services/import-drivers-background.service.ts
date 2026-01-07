import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
	ExternalDriver,
	ExternalApiResponse,
} from '../interfaces/external-driver.interface';
import { UserRole, UserStatus } from '@prisma/client';
import axios from 'axios';

export interface ImportJobData {
	page: number;
	per_page: number;
	search?: string;
	jobId: string;
}

export interface ImportJobResult {
	imported: number;
	updated: number;
	skipped: number;
	duplicateEmails: number[];
	page: number;
	hasMorePages: boolean;
}

interface ImportJob {
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
export class ImportDriversBackgroundService {
	private readonly logger = new Logger(ImportDriversBackgroundService.name);
	private readonly EXTERNAL_API_URL =
		'https://www.endurance-tms.com/wp-json/tms/v1/drivers';
	private readonly API_KEY = 'tms_api_key_2024_driver_access';
	private readonly REQUEST_TIMEOUT = 60000;

	// In-memory storage for jobs (in production, you might want to use database)
	private jobs = new Map<string, ImportJob>();

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Start import process in background
	 */
	startImport(
		page: number,
		per_page: number,
		search?: string,
	): Promise<{ jobId: string; message: string }> {
		const jobId = `import-${Date.now()}`;

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
					job.endTime = new Date();
				}
			},
		);

		this.logger.log(`Background import started with ID: ${jobId}`);

		return Promise.resolve({
			jobId,
			message: `Background import process started. Job ID: ${jobId}. Check status at /v1/users/import-status/${jobId}`,
		});
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
				const response = await this.fetchExternalDrivers(
					currentPage,
					per_page,
					search,
				);

				if (!response.success) {
					throw new Error(
						'External API returned unsuccessful response',
					);
				}

				// Process drivers
				const result = await this.processDriversBatch(
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
				if (!response.pagination.has_next_page) {
					break;
				}

				currentPage++;

				// Add delay between pages to avoid overwhelming the external API
				await this.delay(2000);
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
				`Background import completed for job ${jobId}: ${totalImported} imported, ${totalUpdated} updated`,
			);
		} catch (error) {
			this.logger.error(
				`Background import failed for job ${jobId}:`,
				error,
			);
			const job = this.jobs.get(jobId);
			if (job) {
				job.status = 'failed';
				job.error = error.message;
				job.endTime = new Date();
			}
			throw error;
		}
	}

	/**
	 * Get import job status
	 */
	getImportStatus(jobId: string): Promise<{
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
			return Promise.reject(new Error(`Job ${jobId} not found`));
		}

		return Promise.resolve({
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
		});
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
			throw new Error(
				`Failed to fetch drivers from external API: ${error.message}`,
			);
		}
	}

	/**
	 * Process a batch of drivers
	 */
	private async processDriversBatch(
		drivers: ExternalDriver[],
		duplicateEmails: number[],
	): Promise<{ imported: number; updated: number; skipped: number }> {
		let imported = 0;
		let updated = 0;
		let skipped = 0;

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
			}

			// Small delay between drivers
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
		// Skip if no email provided
		if (!driver.driver_email || driver.driver_email.trim() === '') {
			this.logger.warn(
				`Skipping driver ${driver.id} - no email provided`,
			);
			return 'skipped';
		}

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
			email: driver.driver_email.trim(),
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
			status: UserStatus.INACTIVE,
			password: null,
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
					email: userData.email,
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
			this.logger.log(
				`Updated driver ${driver.id} (externalId: ${driver.id.toString()}) with driverStatus: ${userData.driverStatus}, latitude: ${userData.latitude}, longitude: ${userData.longitude}`,
			);
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
