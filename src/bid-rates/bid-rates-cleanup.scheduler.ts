import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ChatGateway } from '../chats/chat.gateway';
import { BidRatesService } from './bid-rates.service';

/**
 * Every 3 hours:
 * 1) soft-archive idle bids (is_archive=false, updated_at older than 12h NY)
 * 2) hard-delete archived bids older than 15 days + linked BID chats (no cloud archive)
 */
@Injectable()
export class BidRatesCleanupScheduler {
	private readonly logger = new Logger(BidRatesCleanupScheduler.name);

	constructor(
		private readonly bidRatesService: BidRatesService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
	) {}

	@Cron('0 */3 * * *', { name: 'bid-rates-archive-and-purge' })
	async handleArchiveAndPurge(): Promise<void> {
		this.logger.log('Starting bid_rates archive / purge cron...');

		try {
			const { archivedCount } = await this.bidRatesService.archiveStaleBidRates();
			this.logger.log(
				`bid_rates archive done: marked ${archivedCount} row(s) is_archive=true`,
			);
		} catch (error) {
			this.logger.error('bid_rates archive step failed:', error);
		}

		try {
			const { deletedBidRates, deletedChats } =
				await this.bidRatesService.purgeExpiredArchivedBidRates();

			for (const chat of deletedChats) {
				const payload = {
					chatRoomId: chat.chatId,
					deletedBy: 'system',
				};
				for (const userId of chat.participantIds) {
					this.chatGateway.server
						.to(`user_${userId}`)
						.emit('chatRoomDeleted', payload);
				}
				this.chatGateway.notifyChatRoomDeleted(chat.chatId, 'system', {
					deleted: true,
				});
			}

			this.logger.log(
				`bid_rates purge done: deleted ${deletedBidRates} bid(s), ${deletedChats.length} chat(s)`,
			);
		} catch (error) {
			this.logger.error('bid_rates purge step failed:', error);
		}
	}
}
