import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TmsDriverApplicationService } from './tms-driver-application.service';

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;
const DELAY_MS_BETWEEN_BATCHES = 400;
const MAX_FAILED_IN_STATUS = 200;

type ActivateBackfillJobStatus = 'processing' | 'completed' | 'failed';

interface ActivateBackfillJob {
	id: string;
	status: ActivateBackfillJobStatus;
	progress: number;
	totalMatching: number;
	processedDrivers: number;
	batchesCompleted: number;
	batchSize: number;
	totalSent: number;
	totalFailed: number;
	failedDrivers: Array<{ id: string; externalId: string; email: string | null }>;
	isComplete: boolean;
	startTime: Date;
	endTime?: Date;
	error?: string;
}

@Injectable()
export class TmsDriverApplicationBackfillBackgroundService {
	private readonly logger = new Logger(
		TmsDriverApplicationBackfillBackgroundService.name,
	);
	private readonly jobs = new Map<string, ActivateBackfillJob>();

	constructor(
		private readonly prisma: PrismaService,
		private readonly tmsDriverApplication: TmsDriverApplicationService,
	) {}

	async startBackfill(batchSize?: number): Promise<{ jobId: string; message: string }> {
		const size = this.normalizeBatchSize(batchSize);
		const jobId = `driver-app-activate-${Date.now()}`;

		this.jobs.set(jobId, {
			id: jobId,
			status: 'processing',
			progress: 0,
			totalMatching: 0,
			processedDrivers: 0,
			batchesCompleted: 0,
			batchSize: size,
			totalSent: 0,
			totalFailed: 0,
			failedDrivers: [],
			isComplete: false,
			startTime: new Date(),
		});

		void this.runBackfill(jobId, size).catch((error: Error) => {
			this.logger.error(`Backfill job ${jobId} failed:`, error);
			const job = this.jobs.get(jobId);
			if (job) {
				job.status = 'failed';
				job.error = error.message;
				job.isComplete = true;
				job.endTime = new Date();
			}
		});

		return {
			jobId,
			message: `Background TMS driver/application/activate backfill started. Job ID: ${jobId}. Check status at /v1/tms/driver/application/activate-backfill-status/${jobId}`,
		};
	}

	getStatus(jobId: string): {
		status: string;
		progress: number;
		totalMatching: number;
		processedDrivers: number;
		batchesCompleted: number;
		batchSize: number;
		totalSent: number;
		totalFailed: number;
		failedDrivers: Array<{ id: string; externalId: string; email: string | null }>;
		isComplete: boolean;
		error?: string;
		startTime: Date;
		endTime?: Date;
	} {
		const job = this.jobs.get(jobId);
		if (!job) {
			throw new NotFoundException(`Job ${jobId} not found`);
		}

		return {
			status: job.status,
			progress: job.progress,
			totalMatching: job.totalMatching,
			processedDrivers: job.processedDrivers,
			batchesCompleted: job.batchesCompleted,
			batchSize: job.batchSize,
			totalSent: job.totalSent,
			totalFailed: job.totalFailed,
			failedDrivers: [...job.failedDrivers],
			isComplete: job.isComplete,
			error: job.error,
			startTime: job.startTime,
			endTime: job.endTime,
		};
	}

	private normalizeBatchSize(raw?: number): number {
		const n = raw ?? DEFAULT_BATCH_SIZE;
		if (!Number.isFinite(n)) {
			return DEFAULT_BATCH_SIZE;
		}
		return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(n)));
	}

	private async runBackfill(jobId: string, batchSize: number): Promise<void> {
		const where = {
			status: UserStatus.ACTIVE,
			role: UserRole.DRIVER,
			lastActiveApp: { not: null },
			externalId: { not: null },
		};

		const totalMatching = await this.prisma.user.count({ where });
		const job = this.jobs.get(jobId);
		if (job) {
			job.totalMatching = totalMatching;
		}

		if (totalMatching === 0) {
			if (job) {
				job.status = 'completed';
				job.progress = 100;
				job.isComplete = true;
				job.endTime = new Date();
			}
			return;
		}

		let skip = 0;
		let totalSent = 0;
		let totalFailed = 0;
		const failedAccumulator: ActivateBackfillJob['failedDrivers'] = [];
		let batchesCompleted = 0;

		while (skip < totalMatching) {
			const drivers = await this.prisma.user.findMany({
				where,
				select: {
					id: true,
					email: true,
					externalId: true,
				},
				orderBy: { lastActiveApp: 'asc' },
				skip,
				take: batchSize,
			});

			if (drivers.length === 0) {
				break;
			}

			let batchAttempted = 0;
			for (const driver of drivers) {
				const externalId = driver.externalId?.trim();
				if (!externalId) {
					continue;
				}

				batchAttempted++;
				const ok =
					await this.tmsDriverApplication.notifyDriverApplicationActivated(
						externalId,
					);
				if (ok) {
					totalSent++;
				} else {
					totalFailed++;
					if (failedAccumulator.length < MAX_FAILED_IN_STATUS) {
						failedAccumulator.push({
							id: driver.id,
							externalId,
							email: driver.email ?? null,
						});
					}
				}
			}

			skip += drivers.length;
			batchesCompleted++;

			const j = this.jobs.get(jobId);
			if (j) {
				j.processedDrivers = skip;
				j.batchesCompleted = batchesCompleted;
				j.totalSent = totalSent;
				j.totalFailed = totalFailed;
				j.failedDrivers = [...failedAccumulator];
				j.progress = Math.min(
					100,
					Math.round((skip / totalMatching) * 100),
				);
			}

			if (skip < totalMatching) {
				await this.delay(DELAY_MS_BETWEEN_BATCHES);
			}
		}

		const done = this.jobs.get(jobId);
		if (done) {
			done.status = 'completed';
			done.progress = 100;
			done.processedDrivers = skip;
			done.totalSent = totalSent;
			done.totalFailed = totalFailed;
			done.failedDrivers = [...failedAccumulator];
			done.isComplete = true;
			done.endTime = new Date();
		}

		this.logger.log(
			`Backfill job ${jobId} completed: totalMatching=${totalMatching}, sent=${totalSent}, failed=${totalFailed}, batches=${batchesCompleted}`,
		);
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
