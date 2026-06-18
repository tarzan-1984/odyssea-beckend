import { Injectable } from '@nestjs/common';
import { DriverLogSource } from '@prisma/client';
import { nowInNewYorkAsNaiveDate } from '../common/utils/ny-wall-clock';
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
}
