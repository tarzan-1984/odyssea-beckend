import { HttpException, Injectable, Logger } from '@nestjs/common';
import { LoadChatLogAction, LoadChatLogSource, Prisma } from '@prisma/client';
import {
	getNyWallClockHoursAgo,
	nowInNewYorkAsNaiveDate,
} from '../common/utils/ny-wall-clock';
import { PrismaService } from '../prisma/prisma.service';

export type LoadChatLogPayload = {
	data: unknown;
	result: unknown;
};

@Injectable()
export class LoadChatLogService {
	private readonly logger = new Logger(LoadChatLogService.name);

	constructor(private readonly prisma: PrismaService) {}

	async record(
		action: LoadChatLogAction,
		source: LoadChatLogSource,
		payload: LoadChatLogPayload,
		loadId?: string | null,
	): Promise<void> {
		try {
			const trimmedLoadId = loadId?.trim() || null;
			await this.prisma.loadChatLog.create({
				data: {
					action,
					source,
					loadId: trimmedLoadId,
					data: payload as Prisma.InputJsonValue,
					createdAt: nowInNewYorkAsNaiveDate(),
				},
			});
		} catch (error) {
			this.logger.error('Failed to write load_chats_logs row:', error);
		}
	}

	async recordSuccess(
		action: LoadChatLogAction,
		source: LoadChatLogSource,
		requestData: unknown,
		result: unknown,
		loadId?: string | null,
	): Promise<void> {
		await this.record(
			action,
			source,
			{
				data: requestData,
				result,
			},
			loadId,
		);
	}

	async recordFailure(
		action: LoadChatLogAction,
		source: LoadChatLogSource,
		requestData: unknown,
		error: unknown,
		loadId?: string | null,
	): Promise<void> {
		await this.record(
			action,
			source,
			{
				data: requestData,
				result: {
					ok: false,
					error: this.formatError(error),
				},
			},
			loadId,
		);
	}

	/**
	 * Paginated list for App Logs admin page.
	 * Sorted by createdAt DESC (newest first).
	 */
	async findMany(page: number = 1, limit: number = 20) {
		const safePage = Math.max(1, page);
		const safeLimit = Math.min(100, Math.max(1, limit));
		const skip = (safePage - 1) * safeLimit;

		const [total, rows] = await Promise.all([
			this.prisma.loadChatLog.count(),
			this.prisma.loadChatLog.findMany({
				orderBy: { createdAt: 'desc' },
				skip,
				take: safeLimit,
				select: {
					id: true,
					loadId: true,
					action: true,
					source: true,
					data: true,
					createdAt: true,
				},
			}),
		]);

		const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

		return {
			logs: rows.map((row) => ({
				id: row.id,
				loadId: row.loadId,
				action: row.action,
				source: row.source,
				data: row.data,
				// Naive NY wall-clock TIMESTAMP — expose UTC components as wall time.
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
		const result = await this.prisma.loadChatLog.deleteMany({
			where: {
				createdAt: { lt: cutoff },
			},
		});
		return result.count;
	}

	formatError(error: unknown): string {
		if (error instanceof HttpException) {
			const response = error.getResponse();
			if (typeof response === 'string') {
				return response;
			}
			if (typeof response === 'object' && response !== null) {
				const message = (response as { message?: string | string[] })
					.message;
				if (Array.isArray(message)) {
					return message.join(', ');
				}
				if (typeof message === 'string' && message.trim()) {
					return message;
				}
			}
			return error.message;
		}
		if (error instanceof Error) {
			return error.message;
		}
		return String(error);
	}
}
