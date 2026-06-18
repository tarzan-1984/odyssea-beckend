import { Injectable } from '@nestjs/common';
import { DriverLogSource } from '@prisma/client';
import {
	getNyWallClockHoursAgo,
	nowInNewYorkAsNaiveDate,
} from '../common/utils/ny-wall-clock';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriverLogService {
	constructor(private readonly prisma: PrismaService) {}

	async record(
		driverExternalId: string,
		changes: string,
		source: DriverLogSource,
	): Promise<void> {
		const trimmed = changes.trim();
		if (!trimmed || !driverExternalId.trim()) {
			return;
		}
		await this.prisma.driverLog.create({
			data: {
				driverId: driverExternalId.trim(),
				changes: trimmed,
				source,
				createdAt: nowInNewYorkAsNaiveDate(),
			},
		});
	}

	/** Deletes rows with createdAt strictly older than N hours (NY wall-clock). */
	async purgeOlderThanNyHours(hours: number): Promise<number> {
		const cutoff = getNyWallClockHoursAgo(hours);
		const result = await this.prisma.driverLog.deleteMany({
			where: {
				createdAt: { lt: cutoff },
			},
		});
		return result.count;
	}
}
