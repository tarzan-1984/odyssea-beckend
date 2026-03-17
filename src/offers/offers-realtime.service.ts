import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';

interface EmitOfferUpdatedOptions {
	affectedExternalIds?: Array<string | null | undefined>;
}

@Injectable()
export class OffersRealtimeService {
	private readonly logger = new Logger(OffersRealtimeService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly notificationsWebSocketService: NotificationsWebSocketService,
	) {}

	private async resolveOfferRooms(
		offerId: number,
		affectedExternalIds: Array<string | null | undefined> = [],
	): Promise<string[]> {
		const offer = await this.prisma.offer.findUnique({
			where: { id: offerId },
			select: {
				externalUserId: true,
				rateOffers: {
					where: { active: true },
					select: { driverId: true },
				},
			},
		});

		const externalIds = new Set<string>();

		for (const externalId of affectedExternalIds) {
			const normalized = String(externalId ?? '').trim();
			if (normalized) {
				externalIds.add(normalized);
			}
		}

		if (offer?.externalUserId) {
			externalIds.add(String(offer.externalUserId).trim());
		}

		for (const rateOffer of offer?.rateOffers ?? []) {
			const normalized = String(rateOffer.driverId ?? '').trim();
			if (normalized) {
				externalIds.add(normalized);
			}
		}

		const rooms = new Set<string>(['role_ADMINISTRATOR']);

		if (externalIds.size > 0) {
			const users = await this.prisma.user.findMany({
				where: {
					externalId: { in: Array.from(externalIds) },
				},
				select: { id: true },
			});

			for (const user of users) {
				rooms.add(`user_${user.id}`);
			}
		}

		return Array.from(rooms);
	}

	async emitOfferUpdated(
		offerId: number,
		reason: string,
		options: EmitOfferUpdatedOptions = {},
	) {
		if (!this.notificationsWebSocketService.isServerInitialized()) {
			this.logger.warn(
				`Skipping offerUpdated for offer ${offerId}: WebSocket server is not initialized`,
			);
			return;
		}

		const server = this.notificationsWebSocketService.getServer();
		if (!server) {
			return;
		}

		const rooms = await this.resolveOfferRooms(
			offerId,
			options.affectedExternalIds ?? [],
		);

		server.to(rooms).emit('offerUpdated', {
			offerId,
			reason,
			refreshedAt: new Date().toISOString(),
		});
	}
}
