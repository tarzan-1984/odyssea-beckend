import {
	Injectable,
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
	newChatRoomTimestamps,
	newParticipantJoinedAt,
	nowInNewYorkAsNaiveDate,
} from '../common/utils/ny-wall-clock';
import { getRouteEndpoints } from '../offers/offer-route.util';
import { CreateBidRateDto } from './dto/create-bid-rate.dto';
import { RoutePointDto } from '../offers/dto/create-offer.dto';

const BID_TIMER_MS = 15 * 60 * 1000;
const BID_MAX_EXTEND_MS = 3 * BID_TIMER_MS; // 45 min between created_at and updated_at

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
				status: UserStatus.ACTIVE,
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
			where: {
				role: UserRole.ADMINISTRATOR,
				status: UserStatus.ACTIVE,
			},
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

	private mapBidRate(row: {
		id: number;
		broker: string;
		rate: number;
		status: string;
		ownerId: string;
		chatId: string | null;
		route: Prisma.JsonValue;
		isArchive: boolean;
		createdAt: Date;
		updatedAt: Date;
		owner?: {
			id: string;
			firstName: string | null;
			lastName: string | null;
		} | null;
	}) {
		return {
			id: row.id,
			broker: row.broker,
			rate: row.rate,
			status: row.status,
			ownerId: row.ownerId,
			chatId: row.chatId,
			route: row.route,
			isArchive: row.isArchive,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			owner: row.owner
				? {
						id: row.owner.id,
						firstName: row.owner.firstName,
						lastName: row.owner.lastName,
					}
				: null,
		};
	}

	async findAll(page = 1, limit = 10) {
		const safePage = Math.max(1, Number(page) || 1);
		const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
		const skip = (safePage - 1) * safeLimit;

		const [rows, totalCount] = await Promise.all([
			this.prisma.bidRate.findMany({
				orderBy: { createdAt: 'desc' },
				skip,
				take: safeLimit,
				include: {
					owner: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
						},
					},
				},
			}),
			this.prisma.bidRate.count(),
		]);

		const totalPages = Math.max(1, Math.ceil(totalCount / safeLimit));

		return {
			results: rows.map((row) => this.mapBidRate(row)),
			pagination: {
				current_page: safePage,
				per_page: safeLimit,
				total_count: totalCount,
				total_pages: totalPages,
				has_next_page: safePage < totalPages,
				has_prev_page: safePage > 1,
			},
		};
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
					createdAt: roomTimestamps.createdAt,
					updatedAt: roomTimestamps.updatedAt,
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

	/**
	 * Hard-delete bid rate and linked BID chat (no message archiving).
	 */
	async remove(id: number, deletedByUserId: string) {
		const bidRate = await this.prisma.bidRate.findUnique({
			where: { id },
			select: {
				id: true,
				chatId: true,
				chatRoom: {
					select: {
						id: true,
						participants: {
							select: { userId: true },
						},
					},
				},
			},
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found');
		}

		const chatId = bidRate.chatId;
		const participantIds = [
			...new Set(
				(bidRate.chatRoom?.participants ?? []).map((p) => p.userId),
			),
		];

		await this.prisma.$transaction(async (tx) => {
			await tx.bidRate.delete({
				where: { id },
			});

			if (chatId) {
				await tx.chatRoom.delete({
					where: { id: chatId },
				});
			}
		});

		return {
			success: true,
			deletedBidRateId: id,
			deletedChatId: chatId,
			participantIds,
			deletedByUserId,
		};
	}

	/**
	 * Extend bid timer by +15 minutes on updated_at (NY wall-clock).
	 * Allowed up to 3 times: (updated_at - created_at) must stay under 45 minutes.
	 */
	async extendTime(id: number, requesterId: string) {
		const bidRate = await this.prisma.bidRate.findUnique({
			where: { id },
			select: {
				id: true,
				ownerId: true,
				route: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found');
		}

		if (bidRate.ownerId !== requesterId) {
			throw new ForbiddenException('Only the bid creator can extend the timer');
		}

		const createdAtMs = bidRate.createdAt.getTime();
		const updatedAtMs = bidRate.updatedAt.getTime();
		const alreadyExtendedMs = Math.max(0, updatedAtMs - createdAtMs);

		if (alreadyExtendedMs >= BID_MAX_EXTEND_MS) {
			throw new BadRequestException(
				'Bid time can be extended at most 3 times (1 hour total)',
			);
		}

		const nowNyMs = nowInNewYorkAsNaiveDate().getTime();
		const expiryMs = updatedAtMs + BID_TIMER_MS;
		if (expiryMs <= nowNyMs) {
			throw new BadRequestException('Bid time has already expired');
		}

		const nextUpdatedAt = new Date(updatedAtMs + BID_TIMER_MS);
		const nextExtendedMs = nextUpdatedAt.getTime() - createdAtMs;
		if (nextExtendedMs > BID_MAX_EXTEND_MS) {
			throw new BadRequestException(
				'Bid time can be extended at most 3 times (1 hour total)',
			);
		}

		const updated = await this.prisma.bidRate.update({
			where: { id },
			data: {
				updatedAt: nextUpdatedAt,
			},
			include: {
				owner: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
					},
				},
			},
		});

		return this.mapBidRate(updated);
	}

	/**
	 * Returns whether the current user already pressed +1 for the bid linked to this chat.
	 */
	async getParticipationByChatId(chatRoomId: string, userId: string) {
		const bidRate = await this.prisma.bidRate.findFirst({
			where: { chatId: chatRoomId },
			select: { id: true },
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found for this chat');
		}

		const participant = await this.prisma.bidRateParticipant.findUnique({
			where: {
				userId_bidRateId: {
					userId,
					bidRateId: bidRate.id,
				},
			},
			select: { id: true, createdAt: true, updatedAt: true },
		});

		return {
			bidRateId: bidRate.id,
			hasJoined: Boolean(participant),
			createdAt: participant?.createdAt ?? null,
			updatedAt: participant?.updatedAt ?? null,
		};
	}

	/**
	 * Registers the user in bid_rate_participants (one +1 per user per bid).
	 * Idempotent: if already joined, returns alreadyJoined=true without creating a duplicate.
	 */
	async joinByChatId(chatRoomId: string, userId: string) {
		const bidRate = await this.prisma.bidRate.findFirst({
			where: { chatId: chatRoomId },
			select: { id: true },
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found for this chat');
		}

		const chatMembership = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
			select: { id: true },
		});

		if (!chatMembership) {
			throw new ForbiddenException('You are not a participant of this chat');
		}

		const existing = await this.prisma.bidRateParticipant.findUnique({
			where: {
				userId_bidRateId: {
					userId,
					bidRateId: bidRate.id,
				},
			},
			select: { id: true, createdAt: true, updatedAt: true },
		});

		if (existing) {
			return {
				bidRateId: bidRate.id,
				hasJoined: true,
				alreadyJoined: true,
				createdAt: existing.createdAt,
				updatedAt: existing.updatedAt,
			};
		}

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, externalId: true },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		const now = nowInNewYorkAsNaiveDate();

		try {
			const created = await this.prisma.bidRateParticipant.create({
				data: {
					userId: user.id,
					externalId: this.normalizeExternalId(user.externalId),
					bidRateId: bidRate.id,
					createdAt: now,
					updatedAt: now,
				},
			});

			return {
				bidRateId: bidRate.id,
				hasJoined: true,
				alreadyJoined: false,
				createdAt: created.createdAt,
				updatedAt: created.updatedAt,
			};
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
				const again = await this.prisma.bidRateParticipant.findUnique({
					where: {
						userId_bidRateId: {
							userId,
							bidRateId: bidRate.id,
						},
					},
					select: { createdAt: true, updatedAt: true },
				});
				return {
					bidRateId: bidRate.id,
					hasJoined: true,
					alreadyJoined: true,
					createdAt: again?.createdAt ?? now,
					updatedAt: again?.updatedAt ?? now,
				};
			}
			throw error;
		}
	}

	/**
	 * All auction joiners for a BID chat (for +1 message timers).
	 */
	async listParticipantsByChatId(chatRoomId: string) {
		const bidRate = await this.prisma.bidRate.findFirst({
			where: { chatId: chatRoomId },
			select: { id: true, ownerId: true },
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found for this chat');
		}

		return this.listParticipantsByBidRateId(bidRate.id, bidRate.ownerId);
	}

	/**
	 * All auction joiners for a bid rate (for +1 popup on the bid card).
	 */
	async listParticipantsByBidId(bidRateId: number) {
		const bidRate = await this.prisma.bidRate.findUnique({
			where: { id: bidRateId },
			select: { id: true, ownerId: true },
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found');
		}

		return this.listParticipantsByBidRateId(bidRate.id, bidRate.ownerId);
	}

	private async listParticipantsByBidRateId(bidRateId: number, ownerId: string) {
		const participants = await this.prisma.bidRateParticipant.findMany({
			where: { bidRateId },
			orderBy: { createdAt: 'asc' },
			select: {
				userId: true,
				createdAt: true,
				updatedAt: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						userColor: true,
						role: true,
					},
				},
			},
		});

		return {
			bidRateId,
			ownerId,
			participants: participants.map((row) => ({
				userId: row.userId,
				firstName: row.user.firstName,
				lastName: row.user.lastName,
				profilePhoto: row.user.profilePhoto,
				userColor: row.user.userColor,
				role: row.user.role,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			})),
		};
	}

	/**
	 * Extend a participant's +1 timer by +15 minutes on updated_at (NY wall-clock).
	 * Same rules as bid card: max 3 extends (45 min between created_at and updated_at).
	 * Allowed for the participant or the bid owner.
	 */
	async extendParticipantTimeByChatId(
		chatRoomId: string,
		requesterId: string,
		targetUserId?: string,
	) {
		const bidRate = await this.prisma.bidRate.findFirst({
			where: { chatId: chatRoomId },
			select: { id: true, ownerId: true },
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found for this chat');
		}

		const participantUserId = targetUserId?.trim() || requesterId;
		const isOwner = bidRate.ownerId === requesterId;
		const isSelf = participantUserId === requesterId;

		if (!isOwner && !isSelf) {
			throw new ForbiddenException(
				'Only the participant or the bid creator can extend this timer',
			);
		}

		const participant = await this.prisma.bidRateParticipant.findUnique({
			where: {
				userId_bidRateId: {
					userId: participantUserId,
					bidRateId: bidRate.id,
				},
			},
			select: {
				id: true,
				userId: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!participant) {
			throw new NotFoundException('Bid participant not found');
		}

		const createdAtMs = participant.createdAt.getTime();
		const updatedAtMs = participant.updatedAt.getTime();
		const alreadyExtendedMs = Math.max(0, updatedAtMs - createdAtMs);

		if (alreadyExtendedMs >= BID_MAX_EXTEND_MS) {
			throw new BadRequestException(
				'Bid time can be extended at most 3 times (1 hour total)',
			);
		}

		const nowNyMs = nowInNewYorkAsNaiveDate().getTime();
		const expiryMs = updatedAtMs + BID_TIMER_MS;
		if (expiryMs <= nowNyMs) {
			throw new BadRequestException('Bid time has already expired');
		}

		const nextUpdatedAt = new Date(updatedAtMs + BID_TIMER_MS);
		const nextExtendedMs = nextUpdatedAt.getTime() - createdAtMs;
		if (nextExtendedMs > BID_MAX_EXTEND_MS) {
			throw new BadRequestException(
				'Bid time can be extended at most 3 times (1 hour total)',
			);
		}

		const updated = await this.prisma.bidRateParticipant.update({
			where: { id: participant.id },
			data: { updatedAt: nextUpdatedAt },
			select: {
				userId: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		return {
			bidRateId: bidRate.id,
			participant: updated,
		};
	}
}
