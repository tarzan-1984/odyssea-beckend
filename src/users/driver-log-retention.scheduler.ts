import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DriverLogService } from './driver-log.service';

/** Rows with created_at older than this (NY wall clock) are purged. */
const DRIVER_LOG_RETENTION_HOURS = 12;

/** Every 5 hours at minute 0 (server cron; purge cutoff uses NY wall clock). */
const DRIVER_LOG_RETENTION_CRON = '0 0 */5 * * *';

@Injectable()
export class DriverLogRetentionScheduler {
	private readonly logger = new Logger(DriverLogRetentionScheduler.name);

	constructor(private readonly driverLogService: DriverLogService) {}

	@Cron(DRIVER_LOG_RETENTION_CRON, { name: 'driver-logs-retention-purge' })
	async purgeExpiredDriverLogs(): Promise<void> {
		this.logger.log(
			`Starting driver_logs retention cleanup (older than ${DRIVER_LOG_RETENTION_HOURS}h NY wall clock)...`,
		);

		try {
			const deletedCount =
				await this.driverLogService.purgeOlderThanNyHours(
					DRIVER_LOG_RETENTION_HOURS,
				);

			this.logger.log(
				`driver_logs retention done: deleted ${deletedCount} row(s) with created_at older than ${DRIVER_LOG_RETENTION_HOURS} hour(s) (America/New_York).`,
			);
		} catch (error) {
			this.logger.error('driver_logs retention cleanup failed:', error);
		}
	}
}
