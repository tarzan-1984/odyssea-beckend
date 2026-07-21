import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoadChatLogService } from './load-chat-log.service';

/** Rows with created_at older than this (NY wall clock) are purged. */
const LOAD_CHAT_LOG_RETENTION_HOURS = 24;

/** Twice daily at 00:00 and 12:00 (server cron; purge cutoff uses NY wall clock). */
const LOAD_CHAT_LOG_RETENTION_CRON = '0 0 0,12 * * *';

@Injectable()
export class LoadChatLogRetentionScheduler {
	private readonly logger = new Logger(LoadChatLogRetentionScheduler.name);

	constructor(private readonly loadChatLogService: LoadChatLogService) {}

	@Cron(LOAD_CHAT_LOG_RETENTION_CRON, {
		name: 'load-chats-logs-retention-purge',
	})
	async purgeExpiredLoadChatLogs(): Promise<void> {
		this.logger.log(
			`Starting load_chats_logs retention cleanup (older than ${LOAD_CHAT_LOG_RETENTION_HOURS}h NY wall clock)...`,
		);

		try {
			const deletedCount =
				await this.loadChatLogService.purgeOlderThanNyHours(
					LOAD_CHAT_LOG_RETENTION_HOURS,
				);

			this.logger.log(
				`load_chats_logs retention done: deleted ${deletedCount} row(s) with created_at older than ${LOAD_CHAT_LOG_RETENTION_HOURS} hour(s) (America/New_York).`,
			);
		} catch (error) {
			this.logger.error('load_chats_logs retention cleanup failed:', error);
		}
	}
}
