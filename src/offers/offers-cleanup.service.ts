import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cron job that runs daily to delete inactive offers (active = false).
 * Also deletes linked chat rooms (and their messages, participants) and rate_offers.
 */
@Injectable()
export class OffersCleanupService {
	private readonly logger = new Logger(OffersCleanupService.name);

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Cron job that runs daily at 3:00 AM to delete inactive offers
	 */
	@Cron(CronExpression.EVERY_DAY_AT_3AM)
	async cleanupInactiveOffers() {
		this.logger.log('Starting daily offers cleanup (inactive offers)...');

		try {
			const result = await this.deleteInactiveOffers();
			this.logger.log(
				`Offers cleanup completed. Deleted ${result.offersCount} offers, ${result.chatRoomsCount} chat rooms (with messages).`,
			);
		} catch (error) {
			this.logger.error('Failed to cleanup inactive offers:', error);
			throw error;
		}
	}

	/**
	 * Delete all offers where active = false, their linked chat rooms and rate_offers.
	 * Chat rooms: messages and participants are cascade-deleted by DB.
	 * Offers: rate_offers are cascade-deleted by DB.
	 */
	async deleteInactiveOffers(): Promise<{
		offersCount: number;
		chatRoomsCount: number;
	}> {
		// 1. Get inactive offer IDs
		const inactiveOffers = await this.prisma.offer.findMany({
			where: { active: false },
			select: { id: true },
		});
		const inactiveOfferIds = inactiveOffers.map((o) => o.id);

		if (inactiveOfferIds.length === 0) {
			this.logger.log('No inactive offers to delete');
			return { offersCount: 0, chatRoomsCount: 0 };
		}

		// 2. Delete in transaction: chat rooms first (messages & participants cascade), then offers (rate_offers cascade)
		const result = await this.prisma.$transaction(async (tx) => {
			// Delete chat rooms linked to inactive offers (messages & chat_room_participants cascade by DB)
			const chatRoomsDeleted = await tx.chatRoom.deleteMany({
				where: { offerId: { in: inactiveOfferIds } },
			});

			// Delete offers (rate_offers cascade automatically)
			const offersDeleted = await tx.offer.deleteMany({
				where: { id: { in: inactiveOfferIds } },
			});

			return {
				offersCount: offersDeleted.count,
				chatRoomsCount: chatRoomsDeleted.count,
			};
		});

		this.logger.log(
			`Successfully deleted ${result.offersCount} offers, ${result.chatRoomsCount} chat rooms (with messages)`,
		);
		return result;
	}

	/**
	 * Manual cleanup method for testing or manual execution
	 */
	async manualCleanup(): Promise<{ offersCount: number; chatRoomsCount: number }> {
		this.logger.log('Starting manual offers cleanup...');
		return this.deleteInactiveOffers();
	}
}
