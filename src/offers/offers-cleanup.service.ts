import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { isNyLocaleStringOlderThanHours } from '../common/utils/ny-wall-clock';

const OFFER_UPDATE_TIME_RETENTION_HOURS = 12;

/**
 * Cron job that runs daily to delete:
 * - inactive offers (active = false)
 * - offers whose update_time is older than 12 hours (America/New_York wall clock)
 * Also deletes linked chat rooms (and their messages, participants) and rate_offers.
 */
@Injectable()
export class OffersCleanupService {
	private readonly logger = new Logger(OffersCleanupService.name);

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Cron job that runs daily at 3:00 AM
	 */
	@Cron(CronExpression.EVERY_DAY_AT_3AM)
	async cleanupInactiveOffers() {
		this.logger.log(
			`Starting daily offers cleanup (inactive or update_time older than ${OFFER_UPDATE_TIME_RETENTION_HOURS}h NY)...`,
		);

		try {
			const result = await this.deleteOffersForCleanup();
			this.logger.log(
				`Offers cleanup completed. Deleted ${result.offersCount} offers (${result.inactiveCount} inactive, ${result.staleUpdateTimeCount} stale update_time), ${result.chatRoomsCount} chat rooms (with messages).`,
			);
		} catch (error) {
			this.logger.error('Failed to cleanup offers:', error);
			throw error;
		}
	}

	/**
	 * Delete offers eligible for cleanup and their linked chat rooms / rate_offers.
	 */
	async deleteOffersForCleanup(): Promise<{
		offersCount: number;
		chatRoomsCount: number;
		inactiveCount: number;
		staleUpdateTimeCount: number;
	}> {
		const offers = await this.prisma.offer.findMany({
			select: { id: true, active: true, updateTime: true },
		});

		const inactiveOfferIds = new Set<number>();
		const staleUpdateTimeOfferIds = new Set<number>();

		for (const offer of offers) {
			if (!offer.active) {
				inactiveOfferIds.add(offer.id);
			}
			if (
				isNyLocaleStringOlderThanHours(
					offer.updateTime,
					OFFER_UPDATE_TIME_RETENTION_HOURS,
				)
			) {
				staleUpdateTimeOfferIds.add(offer.id);
			}
		}

		const offerIdsToDelete = [
			...new Set([...inactiveOfferIds, ...staleUpdateTimeOfferIds]),
		];

		if (offerIdsToDelete.length === 0) {
			this.logger.log('No offers to delete');
			return {
				offersCount: 0,
				chatRoomsCount: 0,
				inactiveCount: 0,
				staleUpdateTimeCount: 0,
			};
		}

		const result = await this.prisma.$transaction(async (tx) => {
			const chatRoomsDeleted = await tx.chatRoom.deleteMany({
				where: { offerId: { in: offerIdsToDelete } },
			});

			const offersDeleted = await tx.offer.deleteMany({
				where: { id: { in: offerIdsToDelete } },
			});

			return {
				offersCount: offersDeleted.count,
				chatRoomsCount: chatRoomsDeleted.count,
			};
		});

		this.logger.log(
			`Successfully deleted ${result.offersCount} offers, ${result.chatRoomsCount} chat rooms (with messages)`,
		);

		return {
			...result,
			inactiveCount: inactiveOfferIds.size,
			staleUpdateTimeCount: staleUpdateTimeOfferIds.size,
		};
	}

	/**
	 * Manual cleanup method for testing or manual execution
	 */
	async manualCleanup(): Promise<{
		offersCount: number;
		chatRoomsCount: number;
		inactiveCount: number;
		staleUpdateTimeCount: number;
	}> {
		this.logger.log('Starting manual offers cleanup...');
		return this.deleteOffersForCleanup();
	}
}
