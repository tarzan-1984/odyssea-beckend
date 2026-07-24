import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ChatGateway } from '../chats/chat.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { BidRatesService } from './bid-rates.service';

/** Nest cron with seconds field — every 15 seconds. */
const OFFER_EXPIRY_CRON = '*/15 * * * * *';
/** Max expired rate offers resolved concurrently per chunk. */
const OFFER_EXPIRY_BATCH_SIZE = 50;
/** Postgres advisory lock keys (must not collide with TMS batch locks). */
const OFFER_EXPIRY_LOCK_KEY1 = 88442211;
const OFFER_EXPIRY_LOCK_KEY2 = 15;

/**
 * Bid rates lifecycle crons:
 * 1) every 15s — resolve expired 4-min rate offers (same as client auto-accept)
 * 2) every 3h — soft-archive idle bids + hard-delete old archived bids
 */
@Injectable()
export class BidRatesCleanupScheduler {
	private readonly logger = new Logger(BidRatesCleanupScheduler.name);

	constructor(
		private readonly bidRatesService: BidRatesService,
		private readonly prisma: PrismaService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
	) {}

	/**
	 * Mirror the Next.js BidRateVotersPopup timer expiry path on the server so
	 * offers still resolve when nobody has /bid-rates open.
	 */
	@Cron(OFFER_EXPIRY_CRON, { name: 'bid-rates-resolve-expired-offers' })
	async handleExpiredOffers(): Promise<void> {
		const rows = await this.prisma.$queryRawUnsafe<{ got: boolean }[]>(
			'SELECT pg_try_advisory_lock($1::int, $2::int) AS got',
			OFFER_EXPIRY_LOCK_KEY1,
			OFFER_EXPIRY_LOCK_KEY2,
		);
		if (rows[0]?.got !== true) {
			return;
		}

		try {
			const result = await this.bidRatesService.resolveExpiredOffersBatch(
				OFFER_EXPIRY_BATCH_SIZE,
			);
			if (result.found > 0) {
				this.logger.log(
					`bid_rates expired offers: found=${result.found} accepted=${result.accepted} cleared_too_high=${result.clearedPriceTooHigh} already_cleared=${result.alreadyCleared} failed=${result.failed}`,
				);
			}
		} catch (error) {
			this.logger.error('bid_rates expired offers cron failed:', error);
		} finally {
			await this.prisma.$queryRawUnsafe(
				'SELECT pg_advisory_unlock($1::int, $2::int)',
				OFFER_EXPIRY_LOCK_KEY1,
				OFFER_EXPIRY_LOCK_KEY2,
			);
		}
	}

	@Cron('0 */3 * * *', { name: 'bid-rates-archive-and-purge' })
	async handleArchiveAndPurge(): Promise<void> {
		this.logger.log('Starting bid_rates archive / purge cron...');

		try {
			const { archivedCount, archivedChats } =
				await this.bidRatesService.archiveStaleBidRates();
			this.logger.log(
				`bid_rates archive done: marked ${archivedCount} row(s) is_archive=true`,
			);

			// Drop archived bid chats from client stores so Bid rates unread badge updates immediately
			for (const chat of archivedChats) {
				this.chatGateway.notifyBidRateUpdated({
					bidRateId: chat.bidRateId,
					chatRoomId: chat.chatId,
					reason: 'archived',
					participantIds: chat.participantIds,
				});
				const payload = {
					chatRoomId: chat.chatId,
					deletedBy: 'system',
				};
				for (const userId of chat.participantIds) {
					this.chatGateway.server
						.to(`user_${userId}`)
						.emit('chatRoomDeleted', payload);
				}
			}
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
