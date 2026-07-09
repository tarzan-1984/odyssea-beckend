import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
	newChatRoomTimestamps,
	newParticipantJoinedAt,
} from '../common/utils/ny-wall-clock';
import { getRouteEndpoints } from '../offers/offer-route.util';
import { CreateBidRateDto } from './dto/create-bid-rate.dto';
import { RoutePointDto } from '../offers/dto/create-offer.dto';

function normalizeBidRateRoute(route: RoutePointDto[]): RoutePointDto[] {
	return route.map((point) => ({
		type: point.type,
		location: point.location.trim(),
		time: point.time?.trim() ?? '',
	}));
}

function validateBidRateRoute(route: RoutePointDto[]): void {
	if (route.length < 2) {
		throw new BadRequestException('route must contain at least two points');
	}

	const pickupCount = route.filter(
		(point) => point.type === 'pick_up_location',
	).length;
	const deliveryCount = route.filter(
		(point) => point.type === 'delivery_location',
	).length;

	if (pickupCount < 1 || deliveryCount < 1) {
		throw new BadRequestException(
			'route must contain at least one pick_up_location and one delivery_location',
		);
	}

	if (route[0].type !== 'pick_up_location') {
		throw new BadRequestException('first route point must be pick_up_location');
	}

	if (route[route.length - 1].type !== 'delivery_location') {
		throw new BadRequestException(
			'last route point must be delivery_location',
		);
	}

	if (route.some((point) => !point.location)) {
		throw new BadRequestException('each route point must have a location');
	}
}

const BID_CHAT_DISPATCHER_ROLES: UserRole[] = [
	UserRole.DISPATCHER,
	UserRole.DISPATCHER_TL,
	UserRole.EXPEDITE_MANAGER,
];

const BID_CHAT_ADMIN_EXTERNAL_IDS = new Set(['20', '83']);
const BID_CHAT_HIDDEN_ADMIN_EXTERNAL_ID = '83';

const bidChatInclude = {
	participants: {
		include: {
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					role: true,
					profilePhoto: true,
					userColor: true,
					externalId: true,
					phone: true,
				},
			},
		},
	},
} as const;

type BidChatParticipant = {
	id: string;
	externalId: string | null;
	role: UserRole;
	firstName: string;
	lastName: string;
};

@Injectable()
export class BidRatesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly notificationsService: NotificationsService,
	) {}

	private normalizeExternalId(externalId: string | null | undefined): string {
		return String(externalId ?? '').trim();
	}

	private async resolveBidChatParticipants(): Promise<BidChatParticipant[]> {
		const roleUsers = await this.prisma.user.findMany({
			where: {
				role: { in: BID_CHAT_DISPATCHER_ROLES },
			},
			select: {
				id: true,
				externalId: true,
				role: true,
				firstName: true,
				lastName: true,
			},
		});

		const administrators = await this.prisma.user.findMany({
			where: { role: UserRole.ADMINISTRATOR },
			select: {
				id: true,
				externalId: true,
				role: true,
				firstName: true,
				lastName: true,
			},
		});

		const adminUsers = administrators.filter((user) =>
			BID_CHAT_ADMIN_EXTERNAL_IDS.has(this.normalizeExternalId(user.externalId)),
		);

		const byId = new Map<string, BidChatParticipant>();
		for (const user of [...roleUsers, ...adminUsers]) {
			byId.set(user.id, user);
		}

		return [...byId.values()];
	}

	async create(dto: CreateBidRateDto, creatorId: string) {
		const normalizedRoute = normalizeBidRateRoute(dto.route);
		validateBidRateRoute(normalizedRoute);

		const broker = dto.broker.trim();
		const rate = dto.rate;
		const routeJson = normalizedRoute as unknown as Prisma.InputJsonValue;
		const { pickUp, delivery } = getRouteEndpoints(normalizedRoute);
		const chatName =
			pickUp && delivery
				? `${pickUp} - ${delivery}`
				: pickUp || delivery || 'Bid rate';

		const participantUsers = await this.resolveBidChatParticipants();
		const byId = new Map(participantUsers.map((user) => [user.id, user]));

		if (!byId.has(creatorId)) {
			const creator = await this.prisma.user.findUnique({
				where: { id: creatorId },
				select: {
					id: true,
					externalId: true,
					role: true,
					firstName: true,
					lastName: true,
				},
			});
			if (creator) {
				byId.set(creator.id, creator);
			}
		}

		const uniqueParticipants = [...byId.values()];
		const participantIds = uniqueParticipants.map((user) => user.id);
		const hiddenParticipantIds = uniqueParticipants
			.filter(
				(user) =>
					this.normalizeExternalId(user.externalId) ===
					BID_CHAT_HIDDEN_ADMIN_EXTERNAL_ID,
			)
			.map((user) => user.id);
		const hiddenIdSet = new Set(hiddenParticipantIds);

		const roomTimestamps = newChatRoomTimestamps();
		const joinedAt = newParticipantJoinedAt(roomTimestamps.createdAt);

		const { bidRate, chatRoom } = await this.prisma.$transaction(async (tx) => {
			const chatRoom = await tx.chatRoom.create({
				data: {
					name: chatName,
					type: 'BID',
					adminId: creatorId,
					createdAt: roomTimestamps.createdAt,
					updatedAt: roomTimestamps.updatedAt,
				},
			});

			await tx.chatRoomParticipant.createMany({
				data: participantIds.map((userId) => ({
					chatRoomId: chatRoom.id,
					userId,
					isHidden: false,
					hideParticipant: hiddenIdSet.has(userId),
					joinedAt,
				})),
			});

			const bidRate = await tx.bidRate.create({
				data: {
					route: routeJson,
					broker,
					rate,
					ownerId: creatorId,
					chatId: chatRoom.id,
				},
			});

			const fullChatRoom = await tx.chatRoom.findUnique({
				where: { id: chatRoom.id },
				include: bidChatInclude,
			});

			return { bidRate, chatRoom: fullChatRoom };
		});

		try {
			await this.notificationsService.createGroupChatNotifications(
				{
					id: chatRoom!.id,
					name: chatRoom!.name,
					avatar: chatRoom!.avatar,
				},
				uniqueParticipants.map((user) => ({
					userId: user.id,
					role: user.role,
				})),
				creatorId,
			);
		} catch (error) {
			console.error('Failed to create bid chat notifications:', error);
		}

		return {
			bidRate,
			chatRoom,
			participantIds,
		};
	}
}
