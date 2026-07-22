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

	/**
	 * Paginated list for App Logs → Drivers logs tab.
	 * Sorted by createdAt DESC. Optional search matches driver_id (case-insensitive).
	 */
	async findMany(page: number = 1, limit: number = 20, search?: string) {
		const safePage = Math.max(1, page);
		const safeLimit = Math.min(100, Math.max(1, limit));
		const skip = (safePage - 1) * safeLimit;
		const q = search?.trim() ?? '';

		const where = q
			? {
					driverId: {
						contains: q,
						mode: 'insensitive' as const,
					},
				}
			: {};

		const [total, rows] = await Promise.all([
			this.prisma.driverLog.count({ where }),
			this.prisma.driverLog.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip,
				take: safeLimit,
				select: {
					id: true,
					driverId: true,
					changes: true,
					source: true,
					createdAt: true,
				},
			}),
		]);

		const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

		return {
			logs: rows.map((row) => ({
				id: row.id,
				driverId: row.driverId,
				changes: row.changes,
				source: row.source,
				createdAt: this.formatNaiveTimestampForApi(row.createdAt),
			})),
			pagination: {
				current_page: safePage,
				per_page: safeLimit,
				total_count: total,
				total_pages: totalPages,
				has_next_page: safePage < totalPages,
				has_prev_page: safePage > 1,
			},
		};
	}

	/** Naive NY wall-clock TIMESTAMP as `YYYY-MM-DD HH:mm:ss`. */
	private formatNaiveTimestampForApi(value: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
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
