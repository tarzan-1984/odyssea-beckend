import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserDevicesUserIdBackfillService } from './user-devices-user-id-backfill.service';

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;
const DELAY_MS_BETWEEN_BATCHES = 400;
const MAX_UNMATCHED_IN_STATUS = 200;

type BackfillJobStatus = 'processing' | 'completed' | 'failed';

interface BackfillJob {
	id: string;
	status: BackfillJobStatus;
	progress: number;
	totalMatching: number;
	processedDevices: number;
	batchesCompleted: number;
	batchSize: number;
	totalUpdated: number;
	totalSkippedNoMatch: number;
	unmatchedDevices: Array<{ id: string; userExternalId: string }>;
	isComplete: boolean;
	startTime: Date;
	endTime?: Date;
	error?: string;
}

@Injectable()
export class UserDevicesUserIdBackfillBackgroundService {
	private readonly logger = new Logger(
		UserDevicesUserIdBackfillBackgroundService.name,
	);
	private readonly jobs = new Map<string, BackfillJob>();

	constructor(
		private readonly backfillService: UserDevicesUserIdBackfillService,
	) {}

	async startBackfill(batchSize?: number): Promise<{ jobId: string; message: string }> {
		const size = this.normalizeBatchSize(batchSize);
		const jobId = `user-devices-user-id-${Date.now()}`;

		this.jobs.set(jobId, {
			id: jobId,
			status: 'processing',
			progress: 0,
			totalMatching: 0,
			processedDevices: 0,
			batchesCompleted: 0,
			batchSize: size,
			totalUpdated: 0,
			totalSkippedNoMatch: 0,
			unmatchedDevices: [],
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
			message: `Background user_devices.user_id backfill started. Job ID: ${jobId}. Check status at /v1/users/user-devices/backfill-user-id-status/${jobId}`,
		};
	}

	getStatus(jobId: string): {
		status: string;
		progress: number;
		totalMatching: number;
		processedDevices: number;
		batchesCompleted: number;
		batchSize: number;
		totalUpdated: number;
		totalSkippedNoMatch: number;
		unmatchedDevices: Array<{ id: string; userExternalId: string }>;
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
			processedDevices: job.processedDevices,
			batchesCompleted: job.batchesCompleted,
			batchSize: job.batchSize,
			totalUpdated: job.totalUpdated,
			totalSkippedNoMatch: job.totalSkippedNoMatch,
			unmatchedDevices: [...job.unmatchedDevices],
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
		let skip = 0;
		let totalUpdated = 0;
		let totalSkippedNoMatch = 0;
		let batchesCompleted = 0;
		let totalMatching = 0;
		const unmatchedAccumulator: BackfillJob['unmatchedDevices'] = [];

		while (true) {
			const result = await this.backfillService.backfillUserIdBatch({
				batchSize,
				skip,
			});

			if (batchesCompleted === 0) {
				totalMatching = result.totalMatching;
				const job = this.jobs.get(jobId);
				if (job) {
					job.totalMatching = totalMatching;
				}
			}

			if (result.processedInBatch === 0) {
				break;
			}

			totalUpdated += result.updated;
			totalSkippedNoMatch += result.skippedNoMatch;
			skip = result.nextSkip ?? skip + result.processedInBatch;
			batchesCompleted++;

			for (const row of result.unmatchedDevices) {
				if (unmatchedAccumulator.length >= MAX_UNMATCHED_IN_STATUS) {
					break;
				}
				unmatchedAccumulator.push(row);
			}

			const processedDevices = skip;
			const progress =
				totalMatching > 0
					? Math.min(100, Math.round((processedDevices / totalMatching) * 100))
					: 100;

			const job = this.jobs.get(jobId);
			if (job) {
				job.processedDevices = processedDevices;
				job.batchesCompleted = batchesCompleted;
				job.totalUpdated = totalUpdated;
				job.totalSkippedNoMatch = totalSkippedNoMatch;
				job.unmatchedDevices = [...unmatchedAccumulator];
				job.progress = progress;
			}

			this.logger.log(
				`Backfill job ${jobId} batch ${batchesCompleted}: updated=${result.updated}, skippedNoMatch=${result.skippedNoMatch}, progress=${processedDevices}/${totalMatching}`,
			);

			if (!result.hasMore) {
				break;
			}

			await this.delay(DELAY_MS_BETWEEN_BATCHES);
		}

		const done = this.jobs.get(jobId);
		if (done) {
			done.status = 'completed';
			done.progress = 100;
			done.processedDevices = skip;
			done.totalUpdated = totalUpdated;
			done.totalSkippedNoMatch = totalSkippedNoMatch;
			done.unmatchedDevices = [...unmatchedAccumulator];
			done.isComplete = true;
			done.endTime = new Date();
		}

		this.logger.log(
			`Backfill job ${jobId} completed: totalMatching=${totalMatching}, updated=${totalUpdated}, skippedNoMatch=${totalSkippedNoMatch}, batches=${batchesCompleted}`,
		);
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
