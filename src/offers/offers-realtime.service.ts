import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';

interface EmitOfferUpdatedOptions {
	affectedExternalIds?: Array<string | null | undefined>;
	/** Internal user ID of the user who triggered the action (ensures they receive the event) */
	requestingUserId?: string;
}

/**
 * Staff roles that view Offers in Next and should receive offerUpdated in real time.
 * Mirrors Odyssea-backend-ui DRIVERS_AND_OFFERS_ALLOWED_ROLES (except GAST).
 */
const OFFER_UPDATE_STAFF_ROLES: readonly UserRole[] = [
	UserRole.ADMINISTRATOR,
	UserRole.DISPATCHER,
	UserRole.DISPATCHER_TL,
	UserRole.EXPEDITE_MANAGER,
	UserRole.TRACKING,
	UserRole.TRACKING_TL,
	UserRole.TRACKING_TL_DAYTIME,
	UserRole.TRACKING_TL_NIGHTSHIFT,
	UserRole.TRACKING_TL_MORNINGSHIFT,
	UserRole.DRIVER_UPDATES,
	UserRole.MORNING_TRACKING,
	UserRole.NIGHTSHIFT_TRACKING,
	UserRole.RECRUITER,
	UserRole.RECRUITER_TL,
	UserRole.HR_MANAGER,
	UserRole.MODERATOR,
] as const;

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
		requestingUserId?: string,
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

		const rooms = new Set<string>(
			OFFER_UPDATE_STAFF_ROLES.map((role) => `role_${role}`),
		);

		if (requestingUserId && String(requestingUserId).trim()) {
			rooms.add(`user_${requestingUserId.trim()}`);
		}

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
			options.requestingUserId,
		);

		server.to(rooms).emit('offerUpdated', {
			offerId,
			reason,
			refreshedAt: new Date().toISOString(),
		});
	}
}
