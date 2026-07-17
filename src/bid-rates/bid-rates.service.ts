import {
	Injectable,
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatGateway } from '../chats/chat.gateway';
import { MessagesService } from '../chats/messages.service';
import {
	newChatRoomTimestamps,
	newParticipantJoinedAt,
} from '../common/utils/ny-wall-clock';
import { getRouteEndpoints } from '../offers/offer-route.util';
import { CreateBidRateDto } from './dto/create-bid-rate.dto';
import { UpdateBidRatePriceDto } from './dto/update-bid-rate-price.dto';
import { RoutePointDto } from '../offers/dto/create-offer.dto';

/** Bid / participant timer length in unix seconds. */
const BID_TIMER_SEC = 15 * 60;
/** Freshness window for rate-offer “voters” on the bid card. */
const BID_RATE_VOTE_FRESH_SEC = 4 * 60;
/** Max extend window between created_at and updated_at (unix seconds). */
const BID_MAX_EXTEND_SEC = 3 * BID_TIMER_SEC;
/** Soft-archive idle bids after this many hours (unix vs updated_at). */
const BID_ARCHIVE_IDLE_HOURS = 12;
/** Hard-delete archived bids after this (unix vs updated_at). */
const BID_PURGE_ARCHIVED_DAYS = 15;
const BID_PURGE_ARCHIVED_HOURS = BID_PURGE_ARCHIVED_DAYS * 24;

function nowUnixSeconds(): number {
	return Math.floor(Date.now() / 1000);
}
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
		private readonly chatGateway: ChatGateway,
		private readonly messagesService: MessagesService,
	) {}

	private normalizeExternalId(externalId: string | null | undefined): string {
		return String(externalId ?? '').trim();
	}

	private formatBidPriceUsd(price: number): string {
		return `$${Number(price).toLocaleString('en-US', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		})}`;
	}

	/**
	 * Posts an automated BID price chat message as `senderId` and broadcasts it.
	 * Used for both owner ("Rate changed" / "New offer") and non-owner ("New offer").
	 */
	private async sendBidPriceChatMessage(
		chatRoomId: string,
		senderId: string,
		content: string,
	): Promise<void> {
		try {
			const participantIds = await this.resolveChatParticipantIds(chatRoomId);
			const recipients = participantIds.includes(senderId)
				? participantIds
				: [...participantIds, senderId];
			const message = await this.messagesService.sendMessage(
				{ chatRoomId, content },
				senderId,
				{ participantUserIds: recipients },
			);
			await this.chatGateway.broadcastMessage(
				chatRoomId,
				message,
				recipients,
			);
		} catch (error) {
			console.error('Failed to send bid price chat message:', {
				chatRoomId,
				senderId,
				content,
				error,
			});
		}
	}

	private async resolveChatParticipantIds(
		chatId: string | null | undefined,
	): Promise<string[]> {
		if (!chatId) return [];
		const rows = await this.prisma.chatRoomParticipant.findMany({
			where: { chatRoomId: chatId },
			select: { userId: true },
		});
		return [...new Set(rows.map((row) => row.userId))];
	}

	private notifyBidRateUpdated(params: {
		bidRateId: number;
		chatRoomId: string | null;
		reason: string;
		participantIds: string[];
		bidRate?: unknown;
	}) {
		this.chatGateway.notifyBidRateUpdated(params);
	}

	private async notifyBidRateChangedById(
		bidRateId: number,
		reason: string,
		bidRate?: unknown,
	) {
		const row = await this.prisma.bidRate.findUnique({
			where: { id: bidRateId },
			select: {
				id: true,
				chatId: true,
				chatRoom: {
					select: {
						participants: { select: { userId: true } },
					},
				},
			},
		});

		if (!row) return;

		const participantIds = [
			...new Set(
				(row.chatRoom?.participants ?? []).map((p) => p.userId),
			),
		];

		this.notifyBidRateUpdated({
			bidRateId: row.id,
			chatRoomId: row.chatId,
			reason,
			participantIds,
			bidRate,
		});
	}

	private async resolveBidChatParticipants(): Promise<BidChatParticipant[]> {
		const [roleUsers, administrators] = await Promise.all([
			this.prisma.user.findMany({
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
			}),
			this.prisma.user.findMany({
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
			}),
		]);

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
		distance: number | null;
		isArchive: boolean;
		createdAt: number;
		updatedAt: number;
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
			distance: row.distance,
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

	async findAll(requesterId: string, page = 1, limit = 10) {
		const safePage = Math.max(1, Number(page) || 1);
		const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
		const skip = (safePage - 1) * safeLimit;
		// Only bids whose linked chat includes the requester as a participant.
		const listWhere = {
			isArchive: false,
			chatRoom: {
				participants: {
					some: {
						userId: requesterId,
					},
				},
			},
		};

		const [rows, totalCount] = await Promise.all([
			this.prisma.bidRate.findMany({
				where: listWhere,
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
			this.prisma.bidRate.count({ where: listWhere }),
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
		const distance = dto.distance;
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
		const creatorParticipant = byId.get(creatorId);
		const creatorExternalId = this.normalizeExternalId(
			creatorParticipant?.externalId,
		);
		const bidUnix = nowUnixSeconds();

		const { bidRate, chatRoomId } = await this.prisma.$transaction(async (tx) => {
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
					distance,
					ownerId: creatorId,
					chatId: chatRoom.id,
					createdAt: bidUnix,
					updatedAt: bidUnix,
				},
			});

			// Record bid creator in bid_rate_participants with is_owner=true.
			await tx.bidRateParticipant.create({
				data: {
					userId: creatorId,
					externalId: creatorExternalId,
					bidRateId: bidRate.id,
					isOwner: true,
					createdAt: bidUnix,
					updatedAt: bidUnix,
				},
			});

			return { bidRate, chatRoomId: chatRoom.id };
		});

		// Load chat payload outside the write transaction (many participants).
		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: chatRoomId },
			include: bidChatInclude,
		});

		// Notifications are sequential per participant and slow — do not block create response.
		void this.notificationsService
			.createGroupChatNotifications(
				{
					id: chatRoomId,
					name: chatRoom?.name ?? chatName,
					avatar: chatRoom?.avatar ?? null,
				},
				uniqueParticipants.map((user) => ({
					userId: user.id,
					role: user.role,
				})),
				creatorId,
			)
			.catch((error) => {
				console.error('Failed to create bid chat notifications:', error);
			});

		this.notifyBidRateUpdated({
			bidRateId: bidRate.id,
			chatRoomId,
			reason: 'created',
			participantIds,
		});

		return {
			bidRate,
			chatRoom,
			participantIds,
		};
	}

	/**
	 * Hard-delete bid rate and linked BID chat.
	 * Messages are removed with the chat room (DB cascade) — no S3 / cloud message archive.
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

		this.notifyBidRateUpdated({
			bidRateId: id,
			chatRoomId: chatId,
			reason: 'deleted',
			participantIds,
		});

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
	 * Soft-archive idle bids: is_archive=false and updated_at older than 12h (unix).
	 * Bumping updated_at on archive starts the 15-day purge clock.
	 * Linked BID chats stay in DB until purge, but are excluded from chat lists / unread badges.
	 */
	async archiveStaleBidRates(): Promise<{
		archivedCount: number;
		archivedChats: Array<{
			bidRateId: number;
			chatId: string;
			participantIds: string[];
		}>;
	}> {
		const nowSec = nowUnixSeconds();
		const cutoff = nowSec - BID_ARCHIVE_IDLE_HOURS * 3600;
		const rows = await this.prisma.bidRate.findMany({
			where: {
				isArchive: false,
				updatedAt: { lt: cutoff },
			},
			select: {
				id: true,
				chatId: true,
				chatRoom: {
					select: {
						participants: { select: { userId: true } },
					},
				},
			},
		});

		if (rows.length === 0) {
			return { archivedCount: 0, archivedChats: [] };
		}

		const result = await this.prisma.bidRate.updateMany({
			where: {
				id: { in: rows.map((row) => row.id) },
			},
			data: {
				isArchive: true,
				updatedAt: nowSec,
			},
		});

		const archivedChats = rows
			.filter(
				(row): row is typeof row & { chatId: string } =>
					typeof row.chatId === 'string' && row.chatId.length > 0,
			)
			.map((row) => ({
				bidRateId: row.id,
				chatId: row.chatId,
				participantIds: [
					...new Set(
						(row.chatRoom?.participants ?? []).map((p) => p.userId),
					),
				],
			}));

		return { archivedCount: result.count, archivedChats };
	}

	/**
	 * Hard-delete archived bids whose updated_at is older than 15 days (unix),
	 * including linked BID chats (no cloud message archive).
	 */
	async purgeExpiredArchivedBidRates(): Promise<{
		deletedBidRates: number;
		deletedChats: Array<{ chatId: string; participantIds: string[] }>;
	}> {
		const cutoff = nowUnixSeconds() - BID_PURGE_ARCHIVED_HOURS * 3600;
		const rows = await this.prisma.bidRate.findMany({
			where: {
				isArchive: true,
				updatedAt: { lt: cutoff },
			},
			select: {
				id: true,
				chatId: true,
				chatRoom: {
					select: {
						id: true,
						participants: { select: { userId: true } },
					},
				},
			},
		});

		if (rows.length === 0) {
			return { deletedBidRates: 0, deletedChats: [] };
		}

		const deletedChats: Array<{ chatId: string; participantIds: string[] }> =
			[];
		const bidIds = rows.map((r) => r.id);
		const chatIds = [
			...new Set(
				rows
					.map((r) => r.chatId)
					.filter((id): id is string => typeof id === 'string' && id.length > 0),
			),
		];

		for (const row of rows) {
			if (!row.chatId) continue;
			deletedChats.push({
				chatId: row.chatId,
				participantIds: [
					...new Set(
						(row.chatRoom?.participants ?? []).map((p) => p.userId),
					),
				],
			});
		}

		await this.prisma.$transaction(async (tx) => {
			await tx.bidRate.deleteMany({
				where: { id: { in: bidIds } },
			});
			if (chatIds.length > 0) {
				await tx.chatRoom.deleteMany({
					where: { id: { in: chatIds } },
				});
			}
		});

		return {
			deletedBidRates: bidIds.length,
			deletedChats,
		};
	}

	/**
	 * Extend bid timer by +15 minutes on updated_at (unix seconds).
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

		const createdAtSec = bidRate.createdAt;
		const updatedAtSec = bidRate.updatedAt;
		const alreadyExtendedSec = Math.max(0, updatedAtSec - createdAtSec);

		if (alreadyExtendedSec >= BID_MAX_EXTEND_SEC) {
			throw new BadRequestException(
				'Bid time can be extended at most 3 times (1 hour total)',
			);
		}

		const nowSec = nowUnixSeconds();
		const expirySec = updatedAtSec + BID_TIMER_SEC;
		if (expirySec <= nowSec) {
			throw new BadRequestException('Bid time has already expired');
		}

		const nextUpdatedAt = updatedAtSec + BID_TIMER_SEC;
		const nextExtendedSec = nextUpdatedAt - createdAtSec;
		if (nextExtendedSec > BID_MAX_EXTEND_SEC) {
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

		const mapped = this.mapBidRate(updated);
		await this.notifyBidRateChangedById(id, 'timer_extended', mapped);
		return mapped;
	}

	/**
	 * Updates bid price for any linked BID chat participant.
	 *
	 * Non-owner (not the bid creator):
	 *   write to that user's bid_rate_participants.rate + created_rate_at,
	 *   and post yellow "New offer: $X" chat message from the requester.
	 *
	 * Owner:
	 *   If no non-owner +1 rows exist, or all their timers have expired:
	 *     write to bid_rates.rate and reset created_at/updated_at to now
	 *     (restarts the 15-min card timer with up to 3 extends)
	 *     + green "Rate changed to $X" from the owner.
	 *   If at least one non-owner +1 timer is still active:
	 *     write to bid_rate_participants.rate for the bid owner row
	 *     + yellow "New offer: $X" from the owner.
	 */
	async updateNewPrice(
		id: number,
		requesterId: string,
		dto: UpdateBidRatePriceDto,
	) {
		const bidRate = await this.prisma.bidRate.findUnique({
			where: { id },
			select: {
				id: true,
				ownerId: true,
				chatId: true,
			},
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found');
		}

		const chatId = bidRate.chatId;
		if (!chatId) {
			throw new ForbiddenException('Bid has no linked chat');
		}

		const chatMembership = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId: chatId,
					userId: requesterId,
				},
			},
			select: { id: true },
		});

		if (!chatMembership) {
			throw new ForbiddenException(
				'Only chat participants can update the bid price',
			);
		}

		const nowSec = nowUnixSeconds();
		const isOwnerRequester = requesterId === bidRate.ownerId;
		const offerMessage = `New offer: ${this.formatBidPriceUsd(dto.newPrice)}`;
		const rateChangedMessage = `Rate changed to ${this.formatBidPriceUsd(dto.newPrice)}`;

		if (!isOwnerRequester) {
			const existing = await this.prisma.bidRateParticipant.findUnique({
				where: {
					userId_bidRateId: {
						userId: requesterId,
						bidRateId: id,
					},
				},
				select: { id: true, isOwner: true },
			});

			if (existing?.isOwner) {
				throw new ForbiddenException(
					'Bid creator participant row cannot store a non-owner offer',
				);
			}

			if (existing) {
				await this.prisma.bidRateParticipant.update({
					where: { id: existing.id },
					data: {
						rate: dto.newPrice,
						createdRateAt: nowSec,
					},
				});
			} else {
				const user = await this.prisma.user.findUnique({
					where: { id: requesterId },
					select: { externalId: true },
				});
				await this.prisma.bidRateParticipant.create({
					data: {
						userId: requesterId,
						externalId: this.normalizeExternalId(user?.externalId),
						bidRateId: id,
						isOwner: false,
						rate: dto.newPrice,
						createdRateAt: nowSec,
						// Required row timestamps; not tied to the +1 timer cycle.
						createdAt: nowSec,
						updatedAt: nowSec,
					},
				});
			}

			const current = await this.prisma.bidRate.findUnique({
				where: { id },
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

			if (!current) {
				throw new NotFoundException('Bid rate not found');
			}

			const mapped = this.mapBidRate(current);
			// Yellow "New offer" bubble — same style as owner offer while +1 is active.
			await this.sendBidPriceChatMessage(chatId, requesterId, offerMessage);
			await this.notifyBidRateChangedById(
				id,
				'participant_rate_updated',
				mapped,
			);
			return mapped;
		}

		const plusOneRows = await this.prisma.bidRateParticipant.findMany({
			where: { bidRateId: id, isOwner: false },
			select: { updatedAt: true },
		});
		const hasActivePlusOneTimer = plusOneRows.some(
			(row) => row.updatedAt + BID_TIMER_SEC > nowSec,
		);

		if (hasActivePlusOneTimer) {
			const ownerRow = await this.prisma.bidRateParticipant.findUnique({
				where: {
					userId_bidRateId: {
						userId: bidRate.ownerId,
						bidRateId: id,
					},
				},
				select: { id: true, isOwner: true },
			});

			if (!ownerRow || !ownerRow.isOwner) {
				throw new NotFoundException('Bid owner participant row not found');
			}

			await this.prisma.bidRateParticipant.update({
				where: { id: ownerRow.id },
				data: {
					rate: dto.newPrice,
					createdRateAt: nowSec,
				},
			});

			const current = await this.prisma.bidRate.findUnique({
				where: { id },
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

			if (!current) {
				throw new NotFoundException('Bid rate not found');
			}

			const mapped = this.mapBidRate(current);
			await this.sendBidPriceChatMessage(
				chatId,
				bidRate.ownerId,
				offerMessage,
			);
			await this.notifyBidRateChangedById(
				id,
				'owner_participant_rate_updated',
				mapped,
			);
			return mapped;
		}

		const updated = await this.prisma.bidRate.update({
			where: { id },
			data: {
				rate: dto.newPrice,
				// Restart card timer: fresh 15 min + up to 3 extends.
				createdAt: nowSec,
				updatedAt: nowSec,
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

		const mapped = this.mapBidRate(updated);
		await this.sendBidPriceChatMessage(
			chatId,
			bidRate.ownerId,
			rateChangedMessage,
		);
		await this.notifyBidRateChangedById(id, 'rate_updated', mapped);
		return mapped;
	}

	/**
	 * Returns whether the current user already pressed +1 for the bid linked to this chat,
	 * and whether their +1 timer is still running.
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
			select: { id: true, isOwner: true, createdAt: true, updatedAt: true },
		});

		const hasJoined = Boolean(participant && !participant.isOwner);
		const nowSec = nowUnixSeconds();
		const timerActive =
			hasJoined &&
			participant != null &&
			participant.updatedAt + BID_TIMER_SEC > nowSec;

		return {
			bidRateId: bidRate.id,
			hasJoined,
			timerActive,
			createdAt: hasJoined ? (participant?.createdAt ?? null) : null,
			updatedAt: hasJoined ? (participant?.updatedAt ?? null) : null,
		};
	}

	/**
	 * +1 join / re-join for a BID chat.
	 * First press creates the participant row and starts a 15-min timer.
	 * While the timer is active, further presses are no-ops (alreadyJoined).
	 * After the timer expires, press again resets created_at/updated_at to now
	 * and starts a fresh timer cycle (extendable up to 3 times / 1 hour).
	 */
	async joinByChatId(chatRoomId: string, userId: string) {
		const bidRate = await this.prisma.bidRate.findFirst({
			where: { chatId: chatRoomId },
			select: { id: true, ownerId: true },
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found for this chat');
		}

		if (bidRate.ownerId === userId) {
			const user = await this.prisma.user.findUnique({
				where: { id: userId },
				select: { externalId: true },
			});
			const isAdmin83Exception =
				this.normalizeExternalId(user?.externalId) ===
				BID_CHAT_HIDDEN_ADMIN_EXTERNAL_ID;
			if (!isAdmin83Exception) {
				throw new ForbiddenException(
					'Bid creator cannot join their own bid with +1',
				);
			}
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
			select: { id: true, isOwner: true, createdAt: true, updatedAt: true },
		});

		if (existing?.isOwner) {
			// Creator is already recorded; they cannot also take a +1 slot.
			return {
				bidRateId: bidRate.id,
				hasJoined: false,
				alreadyJoined: true,
				timerActive: false,
				createdAt: null,
				updatedAt: null,
			};
		}

		const now = nowUnixSeconds();

		if (existing && !existing.isOwner) {
			const timerActive = existing.updatedAt + BID_TIMER_SEC > now;
			if (timerActive) {
				return {
					bidRateId: bidRate.id,
					hasJoined: true,
					alreadyJoined: true,
					timerActive: true,
					createdAt: existing.createdAt,
					updatedAt: existing.updatedAt,
				};
			}

			// Previous timer expired — restart a fresh 15-min cycle.
			const restarted = await this.prisma.bidRateParticipant.update({
				where: { id: existing.id },
				data: {
					createdAt: now,
					updatedAt: now,
				},
			});

			const participantIds = await this.resolveChatParticipantIds(chatRoomId);
			this.notifyBidRateUpdated({
				bidRateId: bidRate.id,
				chatRoomId,
				reason: 'participant_rejoined',
				participantIds,
			});

			return {
				bidRateId: bidRate.id,
				hasJoined: true,
				alreadyJoined: false,
				timerActive: true,
				createdAt: restarted.createdAt,
				updatedAt: restarted.updatedAt,
			};
		}

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, externalId: true },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		try {
			const created = await this.prisma.bidRateParticipant.create({
				data: {
					userId: user.id,
					externalId: this.normalizeExternalId(user.externalId),
					bidRateId: bidRate.id,
					isOwner: false,
					createdAt: now,
					updatedAt: now,
				},
			});

			const participantIds = await this.resolveChatParticipantIds(chatRoomId);
			this.notifyBidRateUpdated({
				bidRateId: bidRate.id,
				chatRoomId,
				reason: 'participant_joined',
				participantIds,
			});

			return {
				bidRateId: bidRate.id,
				hasJoined: true,
				alreadyJoined: false,
				timerActive: true,
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
					select: { createdAt: true, updatedAt: true, isOwner: true },
				});
				if (again && !again.isOwner) {
					const timerActive = again.updatedAt + BID_TIMER_SEC > now;
					return {
						bidRateId: bidRate.id,
						hasJoined: true,
						alreadyJoined: true,
						timerActive,
						createdAt: again.createdAt,
						updatedAt: again.updatedAt,
					};
				}
				return {
					bidRateId: bidRate.id,
					hasJoined: false,
					alreadyJoined: true,
					timerActive: false,
					createdAt: null,
					updatedAt: null,
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

	/**
	 * Participants who submitted a rate offer within the last 4 minutes
	 * (rate IS NOT NULL and created_rate_at is fresh).
	 */
	async listRateVotersByBidId(bidRateId: number) {
		const bidRate = await this.prisma.bidRate.findUnique({
			where: { id: bidRateId },
			select: { id: true, ownerId: true },
		});

		if (!bidRate) {
			throw new NotFoundException('Bid rate not found');
		}

		const minCreatedRateAt = nowUnixSeconds() - BID_RATE_VOTE_FRESH_SEC;

		const voters = await this.prisma.bidRateParticipant.findMany({
			where: {
				bidRateId: bidRate.id,
				rate: { not: null },
				createdRateAt: { gte: minCreatedRateAt },
			},
			orderBy: { createdRateAt: 'desc' },
			select: {
				userId: true,
				rate: true,
				createdRateAt: true,
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
			bidRateId: bidRate.id,
			ownerId: bidRate.ownerId,
			participants: voters.map((row) => ({
				userId: row.userId,
				firstName: row.user.firstName,
				lastName: row.user.lastName,
				profilePhoto: row.user.profilePhoto,
				userColor: row.user.userColor,
				role: row.user.role,
				rate: row.rate,
				createdRateAt: row.createdRateAt,
			})),
		};
	}

	private async listParticipantsByBidRateId(bidRateId: number, ownerId: string) {
		// Auction +1 joiners only; exclude the creator row (is_owner=true).
		const participants = await this.prisma.bidRateParticipant.findMany({
			where: { bidRateId, isOwner: false },
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
				isOwner: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!participant || participant.isOwner) {
			throw new NotFoundException('Bid participant not found');
		}

		const createdAtSec = participant.createdAt;
		const updatedAtSec = participant.updatedAt;
		const alreadyExtendedSec = Math.max(0, updatedAtSec - createdAtSec);

		if (alreadyExtendedSec >= BID_MAX_EXTEND_SEC) {
			throw new BadRequestException(
				'Bid time can be extended at most 3 times (1 hour total)',
			);
		}

		const nowSec = nowUnixSeconds();
		const expirySec = updatedAtSec + BID_TIMER_SEC;
		if (expirySec <= nowSec) {
			throw new BadRequestException('Bid time has already expired');
		}

		const nextUpdatedAt = updatedAtSec + BID_TIMER_SEC;
		const nextExtendedSec = nextUpdatedAt - createdAtSec;
		if (nextExtendedSec > BID_MAX_EXTEND_SEC) {
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

		const participantIds = await this.resolveChatParticipantIds(chatRoomId);
		this.notifyBidRateUpdated({
			bidRateId: bidRate.id,
			chatRoomId,
			reason: 'participant_timer_extended',
			participantIds,
		});

		return {
			bidRateId: bidRate.id,
			participant: updated,
		};
	}
}
