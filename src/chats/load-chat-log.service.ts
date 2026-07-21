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
	): Promise<void> {
		try {
			await this.prisma.loadChatLog.create({
				data: {
					action,
					source,
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
	): Promise<void> {
		await this.record(action, source, {
			data: requestData,
			result,
		});
	}

	async recordFailure(
		action: LoadChatLogAction,
		source: LoadChatLogSource,
		requestData: unknown,
		error: unknown,
	): Promise<void> {
		await this.record(action, source, {
			data: requestData,
			result: {
				ok: false,
				error: this.formatError(error),
			},
		});
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
