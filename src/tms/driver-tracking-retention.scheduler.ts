import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Retention window: rows with createdAt strictly older than N calendar months are removed. */
const DRIVER_TRACKING_RETENTION_MONTHS = 2;

@Injectable()
export class DriverTrackingRetentionScheduler {
	private readonly logger = new Logger(DriverTrackingRetentionScheduler.name);

	constructor(private readonly prisma: PrismaService) {}

	@Cron(CronExpression.EVERY_DAY_AT_4AM, {
		name: 'driver-tracking-retention-purge',
	})
	async purgeExpiredDriverTracking(): Promise<void> {
		this.logger.log('Starting daily driver_tracking retention cleanup...');

		try {
			const deletedCount = await this.deleteExpiredTrackingRows();

			this.logger.log(
				`driver_tracking retention done: deleted ${deletedCount} row(s) with createdAt older than ${DRIVER_TRACKING_RETENTION_MONTHS} month(s).`,
			);
		} catch (error) {
			this.logger.error('driver_tracking retention cleanup failed:', error);
		}
	}

	/** Deletes driver_tracking rows where createdAt is before today minus retention months (UTC-relative Date). */
	async deleteExpiredTrackingRows(): Promise<number> {
		const cutoff = new Date();
		cutoff.setMonth(cutoff.getMonth() - DRIVER_TRACKING_RETENTION_MONTHS);

		const result = await this.prisma.driverTracking.deleteMany({
			where: {
				createdAt: { lt: cutoff },
			},
		});

		return result.count;
	}
}
