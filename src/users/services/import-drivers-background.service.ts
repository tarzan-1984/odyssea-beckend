import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
	ExternalDriver,
	ExternalApiResponse,
} from '../interfaces/external-driver.interface';
import axios from 'axios';
import { processImportedDriverByEmail } from './import-driver-by-email.helper';

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
					job.duplicateEmails = [];
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
				const result = await this.processDriversBatch(response.data);
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
					job.duplicateEmails = [];
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
	): Promise<{ imported: number; updated: number; skipped: number }> {
		let imported = 0;
		let updated = 0;
		let skipped = 0;

		for (const driver of drivers) {
			try {
				const result = await this.processDriver(driver);
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
	): Promise<'imported' | 'updated' | 'skipped'> {
		const result = await processImportedDriverByEmail(
			this.prisma,
			driver,
			(value) => this.normalizeCompany(value),
		);
		if (result === 'updated') {
			this.logger.log(
				`Updated driver ${driver.id} (email: ${driver.driver_email}) with driverStatus: ${driver.driver_status ?? 'null'}`,
			);
		}
		if (result === 'skipped' && !driver.driver_email?.trim()) {
			this.logger.warn(`Skipping driver ${driver.id} - no email provided`);
		}
		if (
			result === 'skipped' &&
			driver.driver_email?.trim() &&
			driver.driver_email.trim().length > 0
		) {
			this.logger.warn(
				`Skipping driver ${driver.id} - email ${driver.driver_email} belongs to a non-driver user`,
			);
		}
		return result;
	}

	/**
	 * Utility function to add delay
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
