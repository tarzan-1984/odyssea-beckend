import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { UpdateLoadChatDto } from './dto/update-load-chat.dto';
import { CreateLoadChatDto } from './dto/create-load-chat.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
	newChatRoomTimestamps,
	newParticipantJoinedAt,
	nowInNewYorkAsNaiveDate,
} from '../common/utils/ny-wall-clock';
import { buildArchivedLoadChatSearchWhereInput } from './chat-room-search.util';
import { isMultiUserChatType } from './chat-room-types';
import {
	AmbiguousExternalIdError,
	ChatParticipantRef,
	ExternalIdRoleRequiredError,
	findSingleUserByExternalIdAndParticipantRole,
	isDriverParticipantRole,
	isDriverUserRole,
	participantExternalRoleKey,
	resolveParticipantUser,
	trimExternalId,
	userExternalRoleKey,
	userWhereDriverByExternalId,
	userWhereDriversByExternalIds,
} from '../users/user-external-id-lookup.util';

/**
 * ADMINISTRATOR users are auto-added as hidden LOAD chat participants unless their
 * TMS externalId matches one of these (string keys in DB).
 */
const ADMIN_EXTERNAL_IDS_EXCLUDED_FROM_LOAD_CHAT_AUTOPARTICIPANTS = [
	'1',
	'1195',
	'16',
] as const;

export type CreateLoadChatHardDeletion = {
	chatRoomId: string;
	notifyUserIds: string[];
};

export type CreateLoadChatResult = {
	chatRoom: any;
	kind: 'noop' | 'created' | 'converted';
	hardDeletedChats: CreateLoadChatHardDeletion[];
	conversionParticipantEvents?: {
		chatRoomId: string;
		newParticipants: any[];
		addedUserIds: string[];
		removedUserIds: string[];
	};
};

/** Non-driver participant add/remove applied across every LOAD chat for a load_id. */
export type LoadChatStaffSyncEvent = {
	chatRoomId: string;
	chatRoom: any;
	newParticipants: any[];
	addedUserIds: string[];
	removedUserIds: string[];
};

export type UpdateLoadChatResult = {
	results: CreateLoadChatResult[];
	created: CreateLoadChatResult[];
	existing: CreateLoadChatResult[];
	chats: any[];
	staffSyncEvents: LoadChatStaffSyncEvent[];
};

export type CreateChatRoomResult = {
	chatRoom: any;
	created: boolean;
};

export type BulkDirectChatItemStatus = 'created' | 'existed' | 'error';

export type BulkDirectChatItemResult = {
	driverUserId: string;
	status: BulkDirectChatItemStatus;
	chatRoom?: any;
};

export type BulkDirectChatsResult = {
	created: number;
	existed: number;
	errors: number;
	items: BulkDirectChatItemResult[];
};

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ChatRoomsService {
	private readonly logger = new Logger(ChatRoomsService.name);

	constructor(
		private prisma: PrismaService,
		private notificationsService: NotificationsService,
	) {}

	private mapExternalIdLookupError(error: unknown): never {
		if (error instanceof AmbiguousExternalIdError) {
			throw new BadRequestException(error.message);
		}
		if (error instanceof ExternalIdRoleRequiredError) {
			throw new BadRequestException(error.message);
		}
		throw error;
	}

	/** One LOAD chat per (loadId, driver) — reuse / uniqueness match for TMS create and forks. */
	private loadChatWithDriverWhere(
		loadId: string,
		driverUserId: string,
	): Prisma.ChatRoomWhereInput {
		return {
			type: 'LOAD',
			loadId,
			participants: {
				some: {
					userId: driverUserId,
					user: { role: 'DRIVER' },
				},
			},
		};
	}

	/**
	 * Serialize concurrent create/convert/fork for the same load + driver.
	 * Needed after unique (loadId, type) was dropped for multi-driver forks.
	 */
	private async acquireLoadChatDriverLock(
		tx: Prisma.TransactionClient,
		loadId: string,
		driverUserId: string,
	): Promise<void> {
		await tx.$executeRawUnsafe(
			`SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text))`,
			'create_load_chat',
			`${loadId}:${driverUserId}`,
		);
	}

	private async buildParticipantRefs(
		participantIds: string[],
		participantRefs?: ChatParticipantRef[],
	): Promise<ChatParticipantRef[]> {
		if (participantRefs?.length) {
			return participantRefs;
		}

		const refs: ChatParticipantRef[] = [];
		for (const rawId of participantIds) {
			const id = rawId.trim();
			if (!id) continue;

			const byInternalId = await this.prisma.user.findUnique({
				where: { id },
				select: { id: true, role: true },
			});
			if (byInternalId) {
				refs.push({ id: byInternalId.id, role: byInternalId.role });
			} else {
				refs.push({ id });
			}
		}
		return refs;
	}

	private async resolveParticipantUserOrThrow<
		T extends Prisma.UserSelect,
	>(
		participant: ChatParticipantRef,
		select: T,
	): Promise<Prisma.UserGetPayload<{ select: T }>> {
		try {
			const resolved = await resolveParticipantUser(
				this.prisma,
				participant,
				select,
			);
			if (!resolved) {
				const roleHint = participant.role ? ` and role ${participant.role}` : '';
				throw new BadRequestException(
					`Participant with id ${participant.id}${roleHint} not found`,
				);
			}
			return resolved;
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error;
			}
			this.mapExternalIdLookupError(error);
		}
	}

	/**
	 * Create a new chat room and add participants
	 * This method handles both direct chats between two users and group chats
	 */
	async createChatRoom(
		createChatRoomDto: CreateChatRoomDto,
		creatorId: string,
	): Promise<CreateChatRoomResult> {
		const { name, type, loadId, offerId, avatar, participantIds } =
			createChatRoomDto;

		// Validate that creator is included in participants
		if (!participantIds.includes(creatorId)) {
			participantIds.push(creatorId);
		}

		// For direct and offer chats, ensure exactly 2 unique participants
		if (type === 'DIRECT' || type === 'OFFER') {
			const uniqueParticipantIds = [...new Set(participantIds)];
			if (uniqueParticipantIds.length !== 2) {
				throw new BadRequestException(
					'Direct and offer chats must have exactly 2 participants',
				);
			}
			participantIds.length = 0;
			participantIds.push(...uniqueParticipantIds);
		}

		// For group / bid chats, ensure at least 2 participants
		if (isMultiUserChatType(type) && participantIds.length < 2) {
			throw new BadRequestException(
				'Group and bid chats must have at least 2 participants',
			);
		}

		// For offer chats, name (offer card title) is required
		if (type === 'OFFER' && (!name || String(name).trim() === '')) {
			throw new BadRequestException(
				'Offer chats require a name (format: "firstName lastName (id: offerId)\\npickUp - delivery")',
			);
		}

		// For DIRECT chats: verify the other participant (non-creator) has status ACTIVE
		// (OFFER chats: ACTIVE check temporarily disabled for testing)
		if (type === 'DIRECT') {
			const otherParticipantId = participantIds.find((id) => id !== creatorId);
			if (otherParticipantId) {
				const otherUser = await this.prisma.user.findUnique({
					where: { id: otherParticipantId },
					select: { status: true },
				});
				if (!otherUser || otherUser.status !== 'ACTIVE') {
					throw new BadRequestException(
						'Cannot create chat: the other participant must have ACTIVE status in the system',
					);
				}
			}
		}

		// Check if direct chat already exists between these users.
		// For OFFER chats: we intentionally allow multiple chats with the same user (one per offer).
		// Each offer needs its own chat with each driver, so we never check for existing OFFER chats.
		const directPair =
			type === 'DIRECT'
				? ([participantIds[0], participantIds[1]] as [string, string])
				: null;

		if (directPair) {
			const existingDirectChat = await this.findDirectChat(
				directPair[0],
				directPair[1],
			);
			if (existingDirectChat) {
				const chatRoom = await this.reopenDirectChat(existingDirectChat.id);
				return { chatRoom, created: false };
			}
		}

		// Create chat room and participants in a transaction
		return this.prisma.$transaction(async (prisma) => {
			if (directPair) {
				const existingInTx = await this.findDirectChat(
					directPair[0],
					directPair[1],
					prisma,
				);
				if (existingInTx) {
					const chatRoom = await this.reopenDirectChat(
						existingInTx.id,
						prisma,
					);
					return { chatRoom, created: false };
				}
			}
			// For OFFER chats, name is always passed (offer card title); for others, use passed name or generate
			const chatName =
				type === 'OFFER' ? name!.trim() : (name || (await this.generateDefaultName(type, participantIds)));
			const roomTimestamps = newChatRoomTimestamps();
			const joinedAt = newParticipantJoinedAt(roomTimestamps.createdAt);

			const chatRoom = await prisma.chatRoom.create({
				data: {
					name: chatName,
					type,
					loadId: loadId && loadId.trim() !== '' ? loadId : null,
					offerId: type === 'OFFER' && offerId != null ? offerId : null,
					avatar,
					// for GROUP/BID chats, set creator as admin; DIRECT and OFFER have no admin
					adminId: isMultiUserChatType(type) ? creatorId : null,
					createdAt: roomTimestamps.createdAt,
					updatedAt: roomTimestamps.updatedAt,
				},
			});

			// Add all participants
			const participants = await Promise.all(
				participantIds.map((userId) =>
					prisma.chatRoomParticipant.create({
						data: {
							chatRoomId: chatRoom.id,
							userId,
							joinedAt,
						},
						include: {
							user: {
								select: {
									id: true,
									firstName: true,
									lastName: true,
									role: true,
									profilePhoto: true,
									userColor: true,
								},
							},
						},
					}),
				),
			);

			// Create notifications for chat creation
			if (type === 'DIRECT' || type === 'OFFER') {
				try {
					// Get creator user data
					const creator = await prisma.user.findUnique({
						where: { id: creatorId },
						select: {
							id: true,
							firstName: true,
							lastName: true,
							profilePhoto: true,
							userColor: true,
						},
					});

					// Find the recipient (the other participant)
					const recipient = participants.find(
						(p) => p.userId !== creatorId,
					);

					if (creator && recipient) {
						// Create notification for the recipient
						await this.notificationsService.createPrivateChatNotification(
							creator,
							recipient.userId,
							chatRoom.id,
						);
					}
				} catch (error) {
					// Log error but don't fail the chat creation
					console.error(
						'Failed to create private chat notification:',
						error,
					);
				}
			} else if (isMultiUserChatType(type)) {
				try {
					// Create notifications for group/bid chat participants (except admin)
					const participantsData = participants.map((p) => ({
						userId: p.userId,
						role: p.user.role,
					}));

					await this.notificationsService.createGroupChatNotifications(
						{
							id: chatRoom.id,
							name: chatRoom.name,
							avatar: chatRoom.avatar,
						},
						participantsData,
						creatorId,
					);
				} catch (error) {
					// Log error but don't fail the chat creation
					console.error(
						'Failed to create group chat notifications:',
						error,
					);
				}
			}

			return {
				chatRoom: {
					...chatRoom,
					participants,
				},
				created: true,
			};
		});
	}

	/**
	 * Create OFFER chats for each ACTIVE driver when a new offer is created.
	 * Skips drivers with status !== ACTIVE.
	 * Chat name format: "firstName lastName (id: offerId)\npickUp - delivery"
	 */
	async createOfferChatsForNewOffer(
		offerId: number,
		creatorId: string,
		driverExternalIds: string[],
		pickUp: string,
		delivery: string,
	): Promise<Array<{ chatRoom: any; participantIds: string[] }>> {
		if (driverExternalIds.length === 0) return [];

		// TODO: re-enable status: 'ACTIVE' filter for production
		const drivers = await this.prisma.user.findMany({
			where: userWhereDriversByExternalIds(driverExternalIds),
			select: { id: true, firstName: true, lastName: true, externalId: true },
		});

		const created: Array<{ chatRoom: any; participantIds: string[] }> = [];
		const pickUpTrim = (pickUp || '').trim();
		const deliveryTrim = (delivery || '').trim();
		const routeStr =
			pickUpTrim && deliveryTrim ? `${pickUpTrim} - ${deliveryTrim}` : pickUpTrim || deliveryTrim || '';

		for (const driver of drivers) {
			if (!driver.externalId) continue;
			const chatName = `${driver.firstName} ${driver.lastName} (id: ${offerId})\n${routeStr}`.trim();
			const participantIds = [creatorId, driver.id];
			const { chatRoom } = await this.createChatRoom(
				{
					name: chatName,
					type: 'OFFER',
					offerId,
					participantIds,
				},
				creatorId,
			);
			created.push({
				chatRoom,
				participantIds,
			});
		}
		return created;
	}

	/**
	 * Create private DIRECT chats with many drivers (check-list bulk action).
	 * Skips non-ACTIVE drivers and existing direct chats; does not reopen duplicates.
	 */
	async createBulkDirectChats(
		creatorId: string,
		driverUserIds: string[],
	): Promise<BulkDirectChatsResult> {
		const uniqueDriverIds = [
			...new Set(
				(driverUserIds ?? []).filter(
					(id) => typeof id === 'string' && id.trim() && id !== creatorId,
				),
			),
		];

		const items: BulkDirectChatItemResult[] = [];
		let created = 0;
		let existed = 0;
		let errors = 0;

		for (const driverUserId of uniqueDriverIds) {
			try {
				const driver = await this.prisma.user.findUnique({
					where: { id: driverUserId },
					select: {
						id: true,
						status: true,
						firstName: true,
						lastName: true,
					},
				});

				if (!driver || driver.status !== 'ACTIVE') {
					errors += 1;
					items.push({ driverUserId, status: 'error' });
					continue;
				}

				const existingChat = await this.findDirectChat(
					creatorId,
					driverUserId,
				);
				if (existingChat) {
					existed += 1;
					items.push({
						driverUserId,
						status: 'existed',
						chatRoom: existingChat,
					});
					continue;
				}

				const chatName =
					`${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() ||
					'Driver';

				const { chatRoom, created: wasCreated } = await this.createChatRoom(
					{
						name: chatName,
						type: 'DIRECT',
						participantIds: [creatorId, driverUserId],
					},
					creatorId,
				);

				if (wasCreated) {
					created += 1;
					items.push({
						driverUserId,
						status: 'created',
						chatRoom,
					});
				} else {
					existed += 1;
					items.push({
						driverUserId,
						status: 'existed',
						chatRoom,
					});
				}
			} catch {
				errors += 1;
				items.push({ driverUserId, status: 'error' });
			}
		}

		return { created, existed, errors, items };
	}

	private readonly directChatParticipantInclude = {
		participants: {
			include: {
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						role: true,
						profilePhoto: true,
						userColor: true,
					},
				},
			},
		},
	} as const;

	/**
	 * Prisma filter: DIRECT room whose participants are exactly this pair (no extras).
	 */
	private directChatPairWhere(
		userId1: string,
		userId2: string,
	): Prisma.ChatRoomWhereInput {
		const ids = [userId1, userId2];
		return {
			type: 'DIRECT',
			AND: [
				{ participants: { some: { userId: userId1 } } },
				{ participants: { some: { userId: userId2 } } },
				{
					participants: {
						none: { userId: { notIn: ids } },
					},
				},
			],
		};
	}

	/**
	 * Find a direct chat between two specific users.
	 * Used to prevent creating duplicate direct chats.
	 */
	private async findDirectChat(
		userId1: string,
		userId2: string,
		prisma: PrismaClientLike = this.prisma,
	) {
		const db = prisma as PrismaService;
		return db.chatRoom.findFirst({
			where: this.directChatPairWhere(userId1, userId2),
			include: this.directChatParticipantInclude,
			orderBy: { createdAt: 'asc' },
		});
	}

	/** Unhide a direct chat for both users and return the room with participants. */
	private async reopenDirectChat(
		chatRoomId: string,
		prisma: PrismaClientLike = this.prisma,
	) {
		const db = prisma as PrismaService;
		await db.chatRoomParticipant.updateMany({
			where: { chatRoomId },
			data: { isHidden: false },
		});
		const chatRoom = await db.chatRoom.findUnique({
			where: { id: chatRoomId },
			include: this.directChatParticipantInclude,
		});
		if (!chatRoom) {
			throw new NotFoundException('Direct chat room not found');
		}
		return chatRoom;
	}

	/**
	 * Generate default name for chat rooms based on type and participants
	 */
	private async generateDefaultName(
		type: string,
		participantIds: string[],
	): Promise<string> {
		if (type === 'DIRECT' || type === 'OFFER') {
			const users = await this.prisma.user.findMany({
				where: { id: { in: participantIds } },
				select: { firstName: true, lastName: true },
			});
			return `${users[0].firstName} ${users[0].lastName} & ${users[1].firstName} ${users[1].lastName}`;
		}
		return `Chat Room ${new Date().toLocaleDateString()}`;
	}

	private readonly participantListInclude = {
		participants: {
			include: {
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						role: true,
						profilePhoto: true,
						userColor: true,
						externalId: true,
						phone: true,
					},
				},
			},
		},
		messages: {
			orderBy: {
				createdAt: 'desc' as const,
			},
			take: 1,
			include: {
				sender: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						userColor: true,
						role: true,
						externalId: true,
						phone: true,
					},
				},
			},
		},
	};

	/**
	 * Map raw ChatRoom rows (with participantListInclude) to API list shape with unread counts.
	 */
	private formatChatRoomsListForUser(chatRooms: any[], userId: string) {
		const sortedChatRooms = chatRooms.sort((a, b) => {
			const aParticipant = a.participants.find(
				(p: { userId: string }) => p.userId === userId,
			);
			const bParticipant = b.participants.find(
				(p: { userId: string }) => p.userId === userId,
			);

			if (aParticipant?.pin && !bParticipant?.pin) return -1;
			if (!aParticipant?.pin && bParticipant?.pin) return 1;

			const aLastMessageDate = a.messages[0]?.createdAt || a.createdAt;
			const bLastMessageDate = b.messages[0]?.createdAt || b.createdAt;
			return bLastMessageDate.getTime() - aLastMessageDate.getTime();
		});

		return sortedChatRooms.map((room) => {
			const currentUserParticipant = room.participants.find(
				(p: { userId: string }) => p.userId === userId,
			);

			const unreadCount = currentUserParticipant?.unreadCount ?? 0;

			return {
				...room,
				participants: room.participants.map(
					(participant: {
						user: Record<string, unknown>;
						[key: string]: unknown;
					}) => ({
						...participant,
						user: {
							...participant.user,
							avatar: participant.user.profilePhoto,
							profilePhoto: undefined,
						},
					}),
				),
				lastMessage: room.messages[0]
					? {
							...room.messages[0],
							sender: {
								...room.messages[0].sender,
								avatar: room.messages[0].sender.profilePhoto,
								profilePhoto: undefined,
							},
						}
					: null,
				unreadCount: unreadCount,
				isMuted: currentUserParticipant?.mute || false,
				isPinned: currentUserParticipant?.pin || false,
			};
		});
	}

	/**
	 * Get all chat rooms for a specific user
	 * Returns chat rooms with last message and unread count
	 * Filters out hidden DIRECT chats
	 * LOAD chats where is_load_archived are excluded — use load-archived endpoint.
	 */
	async getUserChatRooms(userId: string) {
		const chatRooms = await this.prisma.chatRoom.findMany({
			where: {
				participants: {
					some: {
						userId,
						isHidden: false,
					},
				},
				isArchived: false,
				AND: [
					{
						OR: [
							{ type: { not: 'LOAD' } },
							{ type: 'LOAD', isLoadArchived: false },
						],
					},
					// Soft-archived bids (bid_rates.is_archive=true) must not appear in lists / unread badges
					{
						OR: [
							{ type: { not: 'BID' } },
							{
								type: 'BID',
								bidRates: {
									some: { isArchive: false },
								},
							},
						],
					},
				],
			},
			include: this.participantListInclude as any,
		});

		return this.formatChatRoomsListForUser(chatRooms, userId);
	}

	/**
	 * Paginated LOAD chats for the user where is_load_archived = true (after delivery cutoff).
	 */
	async getArchivedLoadChatRoomsPage(
		userId: string,
		page: number,
		limitRaw: number,
		searchRaw?: string,
	) {
		const limit = Math.min(Math.max(limitRaw || 10, 1), 50);
		const skip = Math.max(page - 1, 0) * limit;

		const baseWhere: Prisma.ChatRoomWhereInput = {
			type: 'LOAD',
			isLoadArchived: true,
			isArchived: false,
			participants: {
				some: {
					userId,
					isHidden: false,
				},
			},
		};

		const searchFilter = buildArchivedLoadChatSearchWhereInput(searchRaw);
		const where: Prisma.ChatRoomWhereInput = searchFilter
			? { AND: [baseWhere, searchFilter] }
			: baseWhere;

		const chatRooms = await this.prisma.chatRoom.findMany({
			where,
			orderBy: { updatedAt: 'desc' },
			skip,
			take: limit + 1,
			include: this.participantListInclude as any,
		});

		const hasMore = chatRooms.length > limit;
		const pageRows = hasMore ? chatRooms.slice(0, limit) : chatRooms;

		const chatRoomsMapped = this.formatChatRoomsListForUser(pageRows, userId);

		return {
			chatRooms: chatRoomsMapped,
			pagination: {
				page,
				limit,
				hasMore,
			},
		};
	}

	/**
	 * Resolve a LOAD chat by TMS load id for the current user (active or archived).
	 */
	async getLoadChatRoomByLoadId(userId: string, loadIdRaw: string) {
		const loadId = loadIdRaw?.trim();
		if (!loadId) {
			throw new BadRequestException('loadId is required');
		}

		const chatRoom = await this.prisma.chatRoom.findFirst({
			where: {
				type: 'LOAD',
				loadId,
				isArchived: false,
				participants: {
					some: {
						userId,
						isHidden: false,
					},
				},
			},
			orderBy: { createdAt: 'desc' },
			include: this.participantListInclude as any,
		});

		if (!chatRoom) {
			throw new NotFoundException('LOAD chat not found or access denied');
		}

		return this.formatChatRoomsListForUser([chatRoom], userId)[0];
	}

	/**
	 * Verify the user is a participant without loading messages or room metadata.
	 */
	async assertChatRoomAccess(
		chatRoomId: string,
		userId: string,
	): Promise<void> {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}
	}

	/**
	 * Lightweight chat room context for outgoing message / typing flows.
	 * Does not load message history (unlike getChatRoom).
	 * Access check and room load are done in a single query.
	 */
	async getChatRoomOutboundContext(chatRoomId: string, userId: string) {
		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: chatRoomId },
			select: {
				id: true,
				type: true,
				participants: {
					select: {
						userId: true,
						user: {
							select: {
								firstName: true,
							},
						},
					},
				},
			},
		});

		if (!chatRoom) {
			throw new NotFoundException('Chat room not found');
		}

		const isParticipant = chatRoom.participants.some(
			(participant) => participant.userId === userId,
		);
		if (!isParticipant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		return chatRoom;
	}

	/**
	 * Get a specific chat room with its messages and participants
	 */
	async getChatRoom(chatRoomId: string, userId: string) {
		await this.assertChatRoomAccess(chatRoomId, userId);

		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: chatRoomId },
			include: {
				participants: {
					include: {
						user: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								role: true,
								profilePhoto: true,
								userColor: true,
								externalId: true,
								phone: true,
							},
						},
					},
				},
				messages: {
					orderBy: {
						createdAt: 'asc',
					},
					include: {
						sender: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								profilePhoto: true,
								userColor: true,
								role: true,
								externalId: true,
								phone: true,
							},
						},
					},
				},
			},
		});

		if (!chatRoom) {
			throw new NotFoundException('Chat room not found');
		}

		return chatRoom;
	}

	/**
	 * Archive a chat room (soft delete)
	 */
	async archiveChatRoom(chatRoomId: string, userId: string) {
		// Verify user is participant
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		return await this.prisma.chatRoom.update({
			where: { id: chatRoomId },
			data: { isArchived: true },
		});
	}

	/**
	 * Replace trailing "(externalId First Last)" in a LOAD chat title, or append it.
	 */
	private buildLoadChatNameForDriver(
		sourceName: string | null | undefined,
		driver: {
			externalId: string | null;
			firstName: string;
			lastName: string;
		},
	): string {
		const base = String(sourceName ?? '').trim();
		const idPart = String(driver.externalId ?? '').trim();
		const namePart = `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim();
		const inside = [idPart, namePart].filter(Boolean).join(' ');
		const paren = `(${inside})`;
		if (!base) return paren;
		if (/\([^)]*\)\s*$/.test(base)) {
			return base.replace(/\([^)]*\)\s*$/, paren);
		}
		return `${base} ${paren}`;
	}

	/**
	 * Create a new LOAD chat for an additional driver: same staff participants as the source
	 * room (excluding existing drivers), same loadId, updated name parentheses.
	 * Does not modify the source room.
	 */
	async forkLoadChatWithDriver(
		sourceChatRoomId: string,
		driverUserId: string,
		actorUserId: string,
	) {
		const source = await this.prisma.chatRoom.findUnique({
			where: { id: sourceChatRoomId },
			include: {
				participants: {
					include: {
						user: {
							select: {
								id: true,
								role: true,
								firstName: true,
								lastName: true,
								externalId: true,
							},
						},
					},
				},
			},
		});

		if (!source || source.type !== 'LOAD') {
			throw new BadRequestException('Source chat must be a LOAD chat');
		}

		if (!source.loadId?.trim()) {
			throw new BadRequestException('Source LOAD chat has no loadId');
		}

		const actor = source.participants.find((p) => p.userId === actorUserId);
		if (!actor) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		const driver = await this.prisma.user.findUnique({
			where: { id: driverUserId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				externalId: true,
				role: true,
				status: true,
			},
		});

		if (!driver || !isDriverUserRole(driver.role)) {
			throw new BadRequestException('User is not a driver');
		}

		if (driver.status !== 'ACTIVE') {
			throw new BadRequestException('Driver must have ACTIVE status');
		}

		// Reuse existing LOAD chat for this loadId that already includes this driver
		const existingWithDriver = await this.prisma.chatRoom.findFirst({
			where: {
				...this.loadChatWithDriverWhere(source.loadId, driver.id),
				isArchived: false,
			},
			include: this.participantListInclude as any,
			orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
		});
		if (existingWithDriver) {
			return {
				chatRoom: this.formatChatRoomsListForUser(
					[existingWithDriver],
					actorUserId,
				)[0],
				created: false,
			};
		}

		const staffParticipantRows = source.participants.filter(
			(p) => !isDriverUserRole(p.user?.role),
		);

		if (staffParticipantRows.some((p) => p.userId === driver.id)) {
			throw new BadRequestException('Driver is already a non-driver participant');
		}

		const roomName = this.buildLoadChatNameForDriver(source.name, driver);
		const roomTimestamps = newChatRoomTimestamps();
		const joinedAt = newParticipantJoinedAt(roomTimestamps.createdAt);
		const loadId = source.loadId;

		const forked = await this.prisma.$transaction(async (tx) => {
			await this.acquireLoadChatDriverLock(tx, loadId, driver.id);

			const dup = await tx.chatRoom.findFirst({
				where: {
					...this.loadChatWithDriverWhere(loadId, driver.id),
					isArchived: false,
				},
				include: this.participantListInclude as any,
				orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
			});
			if (dup) {
				return { tag: 'reused' as const, chatRoom: dup };
			}

			const chatRoom = await tx.chatRoom.create({
				data: {
					name: roomName,
					type: 'LOAD',
					loadId,
					company: source.company,
					avatar: source.avatar,
					adminId: null,
					offerId: source.offerId,
					deliveryAt: source.deliveryAt,
					isLoadArchived: false,
					createdAt: roomTimestamps.createdAt,
					updatedAt: roomTimestamps.updatedAt,
				},
			});

			const participantRows = [
				...staffParticipantRows.map((p) => ({
					chatRoomId: chatRoom.id,
					userId: p.userId,
					isHidden: p.isHidden,
					hideParticipant: p.hideParticipant,
					mute: false,
					pin: false,
					joinedAt,
				})),
				{
					chatRoomId: chatRoom.id,
					userId: driver.id,
					isHidden: false,
					hideParticipant: false,
					mute: false,
					pin: false,
					joinedAt,
				},
			];

			await tx.chatRoomParticipant.createMany({ data: participantRows });

			const full = await tx.chatRoom.findUnique({
				where: { id: chatRoom.id },
				include: this.participantListInclude as any,
			});
			if (!full) {
				throw new InternalServerErrorException('Forked LOAD chat not found after creation');
			}
			return { tag: 'created' as const, chatRoom: full };
		});

		return {
			chatRoom: this.formatChatRoomsListForUser([forked.chatRoom], actorUserId)[0],
			created: forked.tag === 'created',
		};
	}

	/**
	 * Add new participants to an existing chat room.
	 * For LOAD chats:
	 * - If the source already has a DRIVER, adding another DRIVER forks a new LOAD chat
	 *   (same loadId / staff) instead of adding the driver to the source room.
	 * - If the source has no DRIVER, the first driver is attached in place (name updated);
	 *   any additional drivers still fork.
	 * Each participant is resolved by internal user id, or by externalId + role (driver vs employee).
	 */
	async addParticipants(
		chatRoomId: string,
		participantIds: string[],
		userId: string,
		participantRefs?: ChatParticipantRef[],
	): Promise<{
		newParticipants: any[];
		forkedChatRooms: any[];
		updatedSourceRoom?: { id: string; name: string | null };
	}> {
		const refs = await this.buildParticipantRefs(participantIds, participantRefs);

		// Get chat room info first
		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: chatRoomId },
			include: {
				participants: {
					include: {
						user: {
							select: {
								id: true,
								role: true,
							},
						},
					},
				},
			},
		});

		if (!chatRoom) {
			throw new NotFoundException('Chat room not found');
		}

		// Verify user is participant and can add others
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		const resolvedUsers: Array<{
			id: string;
			firstName: string;
			lastName: string;
			role: string;
			externalId: string | null;
		}> = [];
		const resolvedUserIds: string[] = [];

		for (const ref of refs) {
			const resolved = await this.resolveParticipantUserOrThrow(ref, {
				id: true,
				firstName: true,
				lastName: true,
				role: true,
				externalId: true,
			});

			if (!resolvedUserIds.includes(resolved.id)) {
				resolvedUserIds.push(resolved.id);
				resolvedUsers.push(resolved);
			}
		}

		const driverUsers = resolvedUsers.filter((u) => isDriverUserRole(u.role));
		const nonDriverUsers = resolvedUsers.filter((u) => !isDriverUserRole(u.role));

		const forkedChatRooms: Array<{ chatRoom: any; created: boolean }> = [];
		let driversToAddToSource: typeof driverUsers = [];

		if (chatRoom.type === 'LOAD' && driverUsers.length > 0) {
			const sourceHasDriver = chatRoom.participants.some((p) =>
				isDriverUserRole(p.user?.role),
			);

			if (!sourceHasDriver) {
				const [firstDriver, ...restDrivers] = driverUsers;

				// Prefer an existing LOAD chat for this loadId that already has this driver
				if (chatRoom.loadId?.trim()) {
					const existingWithDriver = await this.prisma.chatRoom.findFirst({
						where: {
							...this.loadChatWithDriverWhere(chatRoom.loadId, firstDriver.id),
							isArchived: false,
						},
						include: this.participantListInclude as any,
						orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
					});
					if (existingWithDriver && existingWithDriver.id !== chatRoom.id) {
						forkedChatRooms.push({
							chatRoom: existingWithDriver,
							created: false,
						});
					} else {
						driversToAddToSource = [firstDriver];
					}
				} else {
					driversToAddToSource = [firstDriver];
				}

				for (const driver of restDrivers) {
					const forked = await this.forkLoadChatWithDriver(
						chatRoomId,
						driver.id,
						userId,
					);
					forkedChatRooms.push(forked);
				}
			} else {
				for (const driver of driverUsers) {
					const forked = await this.forkLoadChatWithDriver(
						chatRoomId,
						driver.id,
						userId,
					);
					forkedChatRooms.push(forked);
				}
			}
		}

		const usersToAddToSource =
			chatRoom.type === 'LOAD' && driverUsers.length > 0
				? [...nonDriverUsers, ...driversToAddToSource]
				: resolvedUsers;

		const newParticipants =
			usersToAddToSource.length > 0
				? await this.addParticipantsToRoom(
						chatRoom,
						usersToAddToSource,
						userId,
					)
				: [];

		let updatedSourceRoom: { id: string; name: string | null } | undefined;
		if (driversToAddToSource.length > 0) {
			const attachedDriver = driversToAddToSource[0];
			const newName = this.buildLoadChatNameForDriver(chatRoom.name, attachedDriver);
			if (newName !== chatRoom.name) {
				await this.prisma.chatRoom.update({
					where: { id: chatRoom.id },
					data: { name: newName },
				});
				updatedSourceRoom = { id: chatRoom.id, name: newName };
			}
		}

		return { newParticipants, forkedChatRooms, updatedSourceRoom };
	}

	private async addParticipantsToRoom(
		chatRoom: {
			id: string;
			name: string | null;
			avatar: string | null;
			type: string;
			participants: Array<{ userId: string }>;
		},
		resolvedUsers: Array<{ id: string; firstName: string; lastName: string }>,
		actorUserId: string,
	) {
		const resolvedUserIds = resolvedUsers.map((u) => u.id);
		const joinedAt = newParticipantJoinedAt();

		const newParticipants = await Promise.all(
			resolvedUserIds.map((participantId) =>
				this.prisma.chatRoomParticipant.create({
					data: {
						chatRoomId: chatRoom.id,
						userId: participantId,
						joinedAt,
					},
					include: {
						user: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								role: true,
								profilePhoto: true,
								userColor: true,
							},
						},
					},
				}),
			),
		);

		if (isMultiUserChatType(chatRoom.type) && resolvedUsers.length > 0) {
			try {
				const allParticipants = [
					...chatRoom.participants.map((p) => ({ userId: p.userId })),
					...resolvedUserIds.map((id) => ({ userId: id })),
				];

				await this.notificationsService.createParticipantsAddedNotifications(
					resolvedUsers,
					{
						id: chatRoom.id,
						name: chatRoom.name,
						avatar: chatRoom.avatar,
					},
					allParticipants,
					actorUserId,
				);
			} catch (error) {
				console.error(
					'Failed to create participants added notifications:',
					error,
				);
			}
		}

		return newParticipants;
	}

	/**
	 * Update chat room information
	 * Allows updating name and archive status
	 */
	async updateChatRoom(
		chatRoomId: string,
		updates: { name?: string; isArchived?: boolean },
		userId: string,
	) {
		// Verify user is participant
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		// Update chat room
		return this.prisma.chatRoom.update({
			where: { id: chatRoomId },
			data: {
				...updates,
				updatedAt: new Date(),
			},
			include: {
				participants: {
					include: {
						user: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								role: true,
								profilePhoto: true,
								userColor: true,
							},
						},
					},
				},
			},
		});
	}

	/**
	 * Remove participant from chat room.
	 * Participant is resolved by internal user id, or by externalId + role (driver vs employee).
	 */
	async removeParticipant(
		chatRoomId: string,
		participantId: string,
		userId: string,
		participantRole?: string,
	) {
		let role = participantRole?.trim() || undefined;
		if (!role) {
			const byInternalId = await this.prisma.user.findUnique({
				where: { id: participantId.trim() },
				select: { role: true },
			});
			role = byInternalId?.role;
		}

		let resolved;
		try {
			resolved = await resolveParticipantUser(
				this.prisma,
				{ id: participantId, role },
				{
					id: true,
					firstName: true,
					lastName: true,
					profilePhoto: true,
					userColor: true,
				},
			);
		} catch (error) {
			this.mapExternalIdLookupError(error);
		}

		if (!resolved) {
			const roleHint = role ? ` and role ${role}` : '';
			throw new BadRequestException(
				`Participant with id ${participantId}${roleHint} not found`,
			);
		}

		const resolvedParticipantId = resolved.id;

		// Get chat room info first
		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: chatRoomId },
			include: {
				participants: true,
			},
		});

		if (!chatRoom) {
			throw new NotFoundException('Chat room not found');
		}

		// Verify user is participant and can remove others
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		// Check if user is removing themselves (leaving group chat)
		const isLeavingSelf = resolvedParticipantId === userId;
		const isGroupChat = isMultiUserChatType(chatRoom.type);

		const leavingUser = resolved;

		// Get remaining participants (excluding the leaving user)
		const remainingParticipants = chatRoom.participants
			.filter((p) => p.userId !== resolvedParticipantId)
			.map((p) => ({ userId: p.userId }));

		// Remove participant
		await this.prisma.chatRoomParticipant.delete({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId: resolvedParticipantId,
				},
			},
		});

		// Participant removed from chat

		// Create notifications based on the type of removal
		if (isGroupChat && leavingUser) {
			try {
				if (isLeavingSelf) {
					// User is leaving themselves - notify remaining participants
					if (remainingParticipants.length > 0) {
						await this.notificationsService.createUserLeftGroupNotifications(
							leavingUser,
							{
								id: chatRoom.id,
								name: chatRoom.name,
							},
							remainingParticipants,
						);
					}
				} else {
					// Admin is removing a participant - notify all participants (including removed one) except admin
					const allParticipants = chatRoom.participants.map((p) => ({
						userId: p.userId,
					}));

					await this.notificationsService.createParticipantRemovedNotifications(
						{
							id: leavingUser.id,
							firstName: leavingUser.firstName,
							lastName: leavingUser.lastName,
						},
						{
							id: chatRoom.id,
							name: chatRoom.name,
							avatar: chatRoom.avatar,
						},
						allParticipants,
						userId, // admin who removed
					);
				}
			} catch (error) {
				// Ignore notification errors to not block removal
				console.error(
					'Failed to create participant removal notifications:',
					error,
				);
			}
		}

		return { success: true, removedUserId: resolvedParticipantId };
	}

	/**
	 * Get chat room participants
	 */
	async getChatRoomParticipants(chatRoomId: string, userId: string) {
		// Verify user is participant
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		// Get all participants
		return this.prisma.chatRoomParticipant.findMany({
			where: { chatRoomId },
			include: {
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						role: true,
						profilePhoto: true,
						userColor: true,
					},
				},
			},
		});
	}

	/**
	 * Delete or hide a chat room
	 * For DIRECT chats: hide for current user, delete completely if both users deleted
	 * For GROUP/BID chats: remove participant if regular user, delete completely if admin
	 */
	async deleteChatRoom(chatRoomId: string, userId: string) {
		// Get chat room info
		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: chatRoomId },
			include: {
				participants: true,
			},
		});

		if (!chatRoom) {
			throw new NotFoundException('Chat room not found');
		}

		// Check if user is participant
		const userParticipant = chatRoom.participants.find(
			(p) => p.userId === userId,
		);
		if (!userParticipant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		// For LOAD chats: only ADMINISTRATOR can delete
		if (chatRoom.type === 'LOAD') {
			// Get user info to check role
			const user = await this.prisma.user.findUnique({
				where: { id: userId },
				select: { role: true },
			});

			if (!user || user.role !== 'ADMINISTRATOR') {
				throw new BadRequestException('Only administrators can delete LOAD chats');
			}

			// Administrator can delete the entire LOAD chat
			await this.prisma.chatRoom.delete({
				where: { id: chatRoomId },
			});
			return { deleted: true, hidden: false };
		}

		if (chatRoom.type === 'DIRECT' || chatRoom.type === 'OFFER') {
			// For DIRECT and OFFER chats: hide for current user
			await this.prisma.chatRoomParticipant.update({
				where: {
					chatRoomId_userId: {
						chatRoomId,
						userId,
					},
				},
				data: {
					isHidden: true,
				},
			});

			// Check if both participants have hidden the chat
			const allParticipants =
				await this.prisma.chatRoomParticipant.findMany({
					where: { chatRoomId },
				});

			const allHidden = allParticipants.every((p) => p.isHidden);

			if (allHidden) {
				// Delete chat room completely
				await this.prisma.chatRoom.delete({
					where: { id: chatRoomId },
				});
				return { deleted: true, hidden: false };
			}

			return { deleted: false, hidden: true };
		} else if (isMultiUserChatType(chatRoom.type)) {
			// For GROUP/BID chats: check if user is admin
			const isAdmin = chatRoom.adminId === userId;

			if (isAdmin) {
				// Admin can delete the entire chat
				await this.prisma.chatRoom.delete({
					where: { id: chatRoomId },
				});
				return { deleted: true, hidden: false };
			} else {
				// Regular participants just leave the chat
				// User leaves group chat

				// Get user info before deleting
				const leavingUser = await this.prisma.user.findUnique({
					where: { id: userId },
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						userColor: true,
					},
				});

				// Leaving user info for notification

				// Get remaining participants (excluding the leaving user)
				const remainingParticipants = chatRoom.participants
					.filter((p) => p.userId !== userId)
					.map((p) => ({ userId: p.userId }));

				// Remaining participants to notify

				// Delete the participant
				await this.prisma.chatRoomParticipant.delete({
					where: {
						chatRoomId_userId: {
							chatRoomId,
							userId,
						},
					},
				});

				// Participant removed from chat

				// Create notifications for remaining participants
				if (leavingUser && remainingParticipants.length > 0) {
					try {
						// Create leave notifications for remaining participants
						await this.notificationsService.createUserLeftGroupNotifications(
							leavingUser,
							{
								id: chatRoom.id,
								name: chatRoom.name,
							},
							remainingParticipants,
						);
						// Notifications created successfully
					} catch (error) {
						// Ignore notification errors to not block removal
						console.error(
							'Failed to create user left group notifications:',
							error,
						);
					}
				}

				return { deleted: false, hidden: false, left: true };
			}
		}

		throw new BadRequestException('Invalid chat room type');
	}

	/**
	 * Unhide a DIRECT chat when a new message is sent
	 */
	async unhideChatRoom(chatRoomId: string, userId: string) {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (participant && participant.isHidden) {
			await this.prisma.chatRoomParticipant.update({
				where: {
					chatRoomId_userId: {
						chatRoomId,
						userId,
					},
				},
				data: {
					isHidden: false,
				},
			});
			return true;
		}

		return false;
	}

	/**
	 * Toggle mute status for a chat room participant
	 */
	async toggleMuteChatRoom(chatRoomId: string, userId: string) {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException(
				'Participant not found in this chat room',
			);
		}

		const updatedParticipant = await this.prisma.chatRoomParticipant.update(
			{
				where: {
					chatRoomId_userId: {
						chatRoomId,
						userId,
					},
				},
				data: {
					mute: !participant.mute,
				},
			},
		);

		return {
			chatRoomId,
			userId,
			mute: updatedParticipant.mute,
		};
	}

	/**
	 * Toggle pin status for a chat room participant
	 */
	async togglePinChatRoom(chatRoomId: string, userId: string) {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException(
				'Participant not found in this chat room',
			);
		}

		const updatedParticipant = await this.prisma.chatRoomParticipant.update(
			{
				where: {
					chatRoomId_userId: {
						chatRoomId,
						userId,
					},
				},
				data: {
					pin: !participant.pin,
				},
			},
		);

		return {
			chatRoomId,
			userId,
			pin: updatedParticipant.pin,
		};
	}

	/**
	 * Mute or unmute specified chat rooms for a user
	 */
	async muteChatRooms(
		userId: string,
		chatRoomIds: string[],
		action: 'mute' | 'unmute',
	) {
		if (!chatRoomIds || chatRoomIds.length === 0) {
			console.log('No chatRoomIds provided, returning empty result');
			return {
				userId,
				mutedCount: 0,
				chatRoomIds: [],
			};
		}

		const muteValue = action === 'mute';
		const oppositeMuteValue = action === 'unmute';

		// Find all chat rooms for the user that match the provided IDs and current mute status
		const participants = await this.prisma.chatRoomParticipant.findMany({
			where: {
				userId,
				mute: oppositeMuteValue, // Find participants with opposite mute status
				chatRoomId: {
					in: chatRoomIds,
				},
			},
			select: {
				chatRoomId: true,
			},
		});

		// Found target participants to toggle mute

		if (participants.length === 0) {
			return {
				userId,
				mutedCount: 0,
				chatRoomIds: [],
			};
		}

		// Update all found participants
		await this.prisma.chatRoomParticipant.updateMany({
			where: {
				userId,
				mute: oppositeMuteValue,
				chatRoomId: {
					in: chatRoomIds,
				},
			},
			data: {
				mute: muteValue,
			},
		});

		const updatedChatRoomIds = participants.map((p) => p.chatRoomId);

		return {
			userId,
			mutedCount: participants.length,
			chatRoomIds: updatedChatRoomIds,
		};
	}

	/**
	 * Create LOAD chat(s) with external participants — one chat per driver in the request.
	 * Reuses an existing LOAD chat for the same loadId + driver; otherwise creates (or
	 * converts the selected driver's OFFER chat when an offer matches load_id).
	 * Non-driver participants are the same across every created chat.
	 * Chat title becomes `{title} ({externalId} {firstName} {lastName})`.
	 */
	async createLoadChat(
		createLoadChatDto: CreateLoadChatDto,
	): Promise<CreateLoadChatResult[]> {
		const { load_id, title, company, participants } = createLoadChatDto;

		const fullChatInclude = {
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
						},
					},
				},
			},
		} as const;

		type ResolvedDriver = {
			id: string;
			status: string;
			firstName: string;
			lastName: string;
			externalId: string | null;
			requestExternalId: string;
		};

		const seenDriverExtIds = new Set<string>();
		const driverParticipants: Array<{ id: string; role: string }> = [];
		for (const participant of participants) {
			if (participant.role.toUpperCase() !== 'DRIVER') continue;
			const extId = participant.id.trim();
			if (!extId || seenDriverExtIds.has(extId)) continue;
			seenDriverExtIds.add(extId);
			driverParticipants.push({ id: extId, role: participant.role });
		}

		if (driverParticipants.length === 0) {
			throw new BadRequestException('Driver participant is required');
		}

		const drivers: ResolvedDriver[] = [];
		for (const driverParticipant of driverParticipants) {
			const driver = await (async () => {
				try {
					return await findSingleUserByExternalIdAndParticipantRole(
						this.prisma,
						driverParticipant.id,
						driverParticipant.role,
						{
							id: true,
							status: true,
							firstName: true,
							lastName: true,
							externalId: true,
						},
					);
				} catch (error) {
					this.mapExternalIdLookupError(error);
				}
			})();

			if (!driver) {
				throw new BadRequestException(
					`Driver with external ID ${driverParticipant.id} not found`,
				);
			}

			if (driver.status !== 'ACTIVE') {
				throw new BadRequestException(
					`Driver with external ID ${driverParticipant.id} is not active`,
				);
			}

			drivers.push({
				id: driver.id,
				status: driver.status,
				firstName: driver.firstName,
				lastName: driver.lastName,
				externalId: driver.externalId,
				requestExternalId: driverParticipant.id,
			});
		}

		// Shared non-driver participants (same staff for every per-driver LOAD chat)
		const { staffParticipantIds, hiddenParticipantIds } =
			await this.resolveLoadChatStaffParticipantIds(participants, {
				excludeUserIds: drivers.map((d) => d.id),
			});
		const hiddenIdSet = new Set(hiddenParticipantIds);
		const requestDriverUserIds = new Set(drivers.map((d) => d.id));

		const offer = await this.prisma.offer.findFirst({
			where: { loadId: load_id },
			orderBy: { id: 'asc' },
		});

		let selectedDriverExternalId: string | null = null;
		let selectedOfferChat: {
			id: string;
			participants: Array<{ userId: string }>;
		} | null = null;

		if (offer) {
			const selectedRate = await this.prisma.rateOffer.findFirst({
				where: { offerId: offer.id, isSelected: true },
				orderBy: { id: 'asc' },
			});
			selectedDriverExternalId = selectedRate?.driverId?.trim() || null;

			if (selectedDriverExternalId) {
				const selectedInRequest = drivers.some(
					(d) => d.requestExternalId.trim() === selectedDriverExternalId,
				);
				if (selectedInRequest) {
					selectedOfferChat = await this.prisma.chatRoom.findFirst({
						where: {
							type: 'OFFER',
							offerId: offer.id,
							participants: {
								some: {
									user: {
										...userWhereDriverByExternalId(selectedDriverExternalId),
									},
								},
							},
						},
						include: {
							participants: { select: { userId: true } },
						},
					});
				}
			}
		}

		const results: CreateLoadChatResult[] = [];
		let offerChatsHardDeleted = false;

		for (const driver of drivers) {
			const chatName = this.buildLoadChatNameForDriver(title, {
				externalId: driver.externalId ?? driver.requestExternalId,
				firstName: driver.firstName,
				lastName: driver.lastName,
			});
			const desiredUnique = [
				...new Set([driver.id, ...staffParticipantIds]),
			];

			const existingLoad = await this.prisma.chatRoom.findFirst({
				where: this.loadChatWithDriverWhere(load_id, driver.id),
				include: fullChatInclude,
				orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
			});
			if (existingLoad) {
				results.push({
					chatRoom: existingLoad,
					kind: 'noop',
					hardDeletedChats: [],
				});
				continue;
			}

			const shouldConvertOffer =
				!!offer &&
				!!selectedOfferChat &&
				!!selectedDriverExternalId &&
				driver.requestExternalId.trim() === selectedDriverExternalId;

			if (shouldConvertOffer && selectedOfferChat) {
				const otherOfferChats = await this.prisma.chatRoom.findMany({
					where: {
						type: 'OFFER',
						offerId: offer!.id,
						id: { not: selectedOfferChat.id },
					},
					include: {
						participants: {
							select: {
								userId: true,
								user: { select: { id: true, role: true } },
							},
						},
					},
				});

				// Keep OFFER chats for other request drivers — they get their own LOAD create below.
				// Delete the rest (losing auction chats for non-assigned drivers).
				const offerChatsToDelete = otherOfferChats.filter((room) => {
					const roomDriverIds = room.participants
						.filter((p) => isDriverUserRole(p.user?.role))
						.map((p) => p.userId);
					return !roomDriverIds.some((id) => requestDriverUserIds.has(id));
				});

				const hardDeletedChats: CreateLoadChatHardDeletion[] =
					offerChatsHardDeleted
						? []
						: offerChatsToDelete.map((r) => ({
								chatRoomId: r.id,
								notifyUserIds: r.participants.map((p) => p.userId),
							}));

				const beforeUserIds = new Set(
					selectedOfferChat.participants.map((p) => p.userId),
				);
				const toRemove = [...beforeUserIds].filter(
					(id) => !desiredUnique.includes(id),
				);
				const toAdd = desiredUnique.filter((id) => !beforeUserIds.has(id));
				const offerChatId = selectedOfferChat.id;

				const convertOutcome = await this.prisma.$transaction(async (tx) => {
					await this.acquireLoadChatDriverLock(tx, load_id, driver.id);

					const already = await tx.chatRoom.findFirst({
						where: this.loadChatWithDriverWhere(load_id, driver.id),
						include: fullChatInclude,
						orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
					});
					if (already) {
						return { tag: 'noop' as const, chatRoom: already };
					}

					if (!offerChatsHardDeleted && offerChatsToDelete.length > 0) {
						await tx.chatRoom.deleteMany({
							where: { id: { in: offerChatsToDelete.map((c) => c.id) } },
						});
					}

					await tx.chatRoom.update({
						where: { id: offerChatId },
						data: {
							type: 'LOAD',
							loadId: load_id,
							name: chatName,
							company,
							updatedAt: nowInNewYorkAsNaiveDate(),
						},
					});

					const addedJoinedAt = newParticipantJoinedAt();

					for (const userId of toRemove) {
						await tx.chatRoomParticipant.delete({
							where: {
								chatRoomId_userId: {
									chatRoomId: offerChatId,
									userId,
								},
							},
						});
					}

					for (const userId of toAdd) {
						await tx.chatRoomParticipant.create({
							data: {
								chatRoomId: offerChatId,
								userId,
								isHidden: false,
								hideParticipant: hiddenIdSet.has(userId),
								joinedAt: addedJoinedAt,
							},
						});
					}

					const retained = desiredUnique.filter((id) => beforeUserIds.has(id));
					for (const userId of retained) {
						await tx.chatRoomParticipant.update({
							where: {
								chatRoomId_userId: {
									chatRoomId: offerChatId,
									userId,
								},
							},
							data: {
								hideParticipant: hiddenIdSet.has(userId),
							},
						});
					}

					const completeChatRoom = await tx.chatRoom.findUnique({
						where: { id: offerChatId },
						include: fullChatInclude,
					});
					if (!completeChatRoom) {
						throw new InternalServerErrorException(
							'Converted LOAD chat not found after transaction',
						);
					}
					return {
						tag: 'converted' as const,
						chatRoom: completeChatRoom,
						hardDeletedChats,
						toAdd,
					};
				});

				if (!offerChatsHardDeleted && hardDeletedChats.length > 0) {
					offerChatsHardDeleted = true;
				}
				selectedOfferChat = null;

				if (convertOutcome.tag === 'noop') {
					results.push({
						chatRoom: convertOutcome.chatRoom,
						kind: 'noop',
						hardDeletedChats: [],
					});
					continue;
				}

				const newParticipants =
					convertOutcome.toAdd.length > 0
						? await this.prisma.chatRoomParticipant.findMany({
								where: {
									chatRoomId: offerChatId,
									userId: { in: convertOutcome.toAdd },
								},
								include: {
									user: {
										select: {
											id: true,
											firstName: true,
											lastName: true,
											role: true,
											profilePhoto: true,
											userColor: true,
											externalId: true,
										},
									},
								},
							})
						: [];

				this.logger.log(
					`[create_load_chat] OFFER→LOAD CONVERTED ${JSON.stringify({
						chatRoomId: convertOutcome.chatRoom.id,
						loadId: load_id,
						title: chatName,
						titleFromRequest: title,
						company,
						driver: {
							userId: driver.id,
							externalId: driver.externalId ?? driver.requestExternalId,
							firstName: driver.firstName,
							lastName: driver.lastName,
						},
						participantUserIds: desiredUnique,
						hiddenParticipantUserIds: hiddenParticipantIds,
						addedUserIds: convertOutcome.toAdd,
						removedUserIds: toRemove,
					})}`,
				);

				results.push({
					chatRoom: convertOutcome.chatRoom,
					kind: 'converted',
					hardDeletedChats: convertOutcome.hardDeletedChats,
					conversionParticipantEvents: {
						chatRoomId: offerChatId,
						newParticipants,
						addedUserIds: convertOutcome.toAdd,
						removedUserIds: toRemove,
					},
				});
				continue;
			}

			const existingAfterOffer = await this.prisma.chatRoom.findFirst({
				where: this.loadChatWithDriverWhere(load_id, driver.id),
				include: fullChatInclude,
				orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
			});
			if (existingAfterOffer) {
				results.push({
					chatRoom: existingAfterOffer,
					kind: 'noop',
					hardDeletedChats: [],
				});
				continue;
			}

			try {
				const outcome = await this.prisma.$transaction(async (prisma) => {
					await this.acquireLoadChatDriverLock(prisma, load_id, driver.id);

					const dup = await prisma.chatRoom.findFirst({
						where: this.loadChatWithDriverWhere(load_id, driver.id),
						include: fullChatInclude,
						orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
					});
					if (dup) {
						return {
							tag: 'noop' as const,
							chatRoom: dup,
							hardDeletedChats: [] as CreateLoadChatHardDeletion[],
						};
					}

					const hardDeletedChats: CreateLoadChatHardDeletion[] = [];

					// Drop this driver's leftover OFFER chat for the offer (if any)
					if (offer) {
						const leftoverOffer = await prisma.chatRoom.findFirst({
							where: {
								type: 'OFFER',
								offerId: offer.id,
								participants: {
									some: { userId: driver.id, user: { role: 'DRIVER' } },
								},
							},
							include: { participants: { select: { userId: true } } },
						});
						if (leftoverOffer) {
							hardDeletedChats.push({
								chatRoomId: leftoverOffer.id,
								notifyUserIds: leftoverOffer.participants.map((p) => p.userId),
							});
							await prisma.chatRoom.delete({ where: { id: leftoverOffer.id } });
						}
					}

					const roomTimestamps = newChatRoomTimestamps();
					const joinedAt = newParticipantJoinedAt(roomTimestamps.createdAt);

					const chatRoom = await prisma.chatRoom.create({
						data: {
							name: chatName,
							type: 'LOAD',
							loadId: load_id,
							company,
							avatar: null,
							adminId: null,
							createdAt: roomTimestamps.createdAt,
							updatedAt: roomTimestamps.updatedAt,
						},
					});

					const participantsData = desiredUnique.map((userId) => ({
						chatRoomId: chatRoom.id,
						userId,
						isHidden: false,
						hideParticipant: hiddenParticipantIds.includes(userId),
						joinedAt,
					}));

					await prisma.chatRoomParticipant.createMany({
						data: participantsData,
					});

					const full = await prisma.chatRoom.findUnique({
						where: { id: chatRoom.id },
						include: fullChatInclude,
					});
					if (!full) {
						throw new InternalServerErrorException(
							'LOAD chat not found after creation',
						);
					}
					return {
						tag: 'created' as const,
						chatRoom: full,
						hardDeletedChats,
					};
				});

				if (outcome.tag === 'noop') {
					results.push({
						chatRoom: outcome.chatRoom,
						kind: 'noop',
						hardDeletedChats: [],
					});
					continue;
				}

				this.logger.log(
					`[create_load_chat] NEW LOAD CHAT CREATED ${JSON.stringify({
						chatRoomId: outcome.chatRoom.id,
						loadId: load_id,
						title: chatName,
						titleFromRequest: title,
						company,
						driver: {
							userId: driver.id,
							externalId: driver.externalId ?? driver.requestExternalId,
							firstName: driver.firstName,
							lastName: driver.lastName,
						},
						participantUserIds: desiredUnique,
						hiddenParticipantUserIds: hiddenParticipantIds,
					})}`,
				);

				results.push({
					chatRoom: outcome.chatRoom,
					kind: 'created',
					hardDeletedChats: outcome.hardDeletedChats,
				});
			} catch (e) {
				if (
					e instanceof Prisma.PrismaClientKnownRequestError &&
					e.code === 'P2002'
				) {
					const existing = await this.prisma.chatRoom.findFirst({
						where: this.loadChatWithDriverWhere(load_id, driver.id),
						include: fullChatInclude,
						orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
					});
					if (existing) {
						results.push({
							chatRoom: existing,
							kind: 'noop',
							hardDeletedChats: [],
						});
						continue;
					}
				}
				throw e;
			}
		}

		return results;
	}

	/**
	 * Ensure one LOAD chat per driver in the request (same rules as create_load_chat).
	 * Missing per-driver chats are created with shared non-driver participants.
	 * After that, non-driver participants are synced across ALL LOAD chats for this load_id
	 * (drivers in each chat are never added/removed by this sync).
	 */
	async updateLoadChatParticipants(
		updateDto: UpdateLoadChatDto,
	): Promise<UpdateLoadChatResult> {
		const loadId = updateDto.load_id?.trim();
		if (!loadId) {
			throw new BadRequestException('load_id is required');
		}

		const existingLoadChats = await this.prisma.chatRoom.findMany({
			where: { loadId, type: 'LOAD' },
			orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
			select: {
				id: true,
				name: true,
				company: true,
			},
		});

		const template = existingLoadChats[0];
		const title =
			updateDto.title?.trim() ||
			this.stripLoadChatDriverSuffix(template?.name) ||
			'';
		const companyRaw = updateDto.company ?? template?.company ?? null;
		const allowedCompanies = ['Odysseia', 'Martlet', 'Endurance'] as const;
		const company = allowedCompanies.includes(
			companyRaw as (typeof allowedCompanies)[number],
		)
			? (companyRaw as (typeof allowedCompanies)[number])
			: null;

		if (!title) {
			throw new BadRequestException(
				'title is required when no existing LOAD chat is available for this load_id',
			);
		}
		if (!company) {
			throw new BadRequestException(
				'company is required when no existing LOAD chat is available for this load_id',
			);
		}

		this.logger.log(
			`[update_load_chat] Ensuring LOAD chats per driver: ${JSON.stringify({
				load_id: loadId,
				title,
				company,
				existingLoadChatCount: existingLoadChats.length,
				participants: updateDto.participants,
			})}`,
		);

		const results = await this.createLoadChat({
			load_id: loadId,
			title,
			company,
			participants: updateDto.participants,
		});

		const staffSyncEvents = await this.syncNonDriverParticipantsForLoad(
			loadId,
			updateDto.participants,
		);

		const syncedByChatId = new Map(
			staffSyncEvents.map((event) => [event.chatRoomId, event.chatRoom]),
		);
		const refreshedResults = results.map((result) => {
			const synced = result.chatRoom?.id
				? syncedByChatId.get(result.chatRoom.id)
				: undefined;
			return synced ? { ...result, chatRoom: synced } : result;
		});

		const created = refreshedResults.filter(
			(r) => r.kind === 'created' || r.kind === 'converted',
		);
		const existing = refreshedResults.filter((r) => r.kind === 'noop');

		this.logger.log(
			`[update_load_chat] Completed: created=${created.length}, existing=${existing.length}, staffSyncedChats=${staffSyncEvents.length}, chatRoomIds=${refreshedResults
				.map((r) => r.chatRoom?.id ?? 'n/a')
				.join(',')}`,
		);

		return {
			results: refreshedResults,
			created,
			existing,
			chats: refreshedResults.map((r) => r.chatRoom),
			staffSyncEvents,
		};
	}

	/**
	 * Compare request non-driver participants (+ auto-admins) with each LOAD chat for the
	 * load, then add/remove staff so every chat matches. Drivers are never touched.
	 *
	 * Comparison is by externalId + role (normalized, order-independent). Request staff
	 * that cannot be resolved must not silently shrink the desired set.
	 */
	private async syncNonDriverParticipantsForLoad(
		loadId: string,
		participants: Array<{ id: string; role: string }>,
	): Promise<LoadChatStaffSyncEvent[]> {
		const { staffParticipants, hiddenParticipantIds } =
			await this.resolveLoadChatStaffParticipants(participants, {
				// Update sync must see every requested staff member or abort.
				// Otherwise a failed lookup drops them from desired and deletes them.
				requireAllResolved: true,
			});

		const desiredByKey = new Map(
			staffParticipants.map((entry) => [entry.key, entry]),
		);
		const desiredStaffIds = [
			...new Set(staffParticipants.map((entry) => entry.userId)),
		];
		const desiredKeySet = new Set(desiredByKey.keys());
		const hiddenIdSet = new Set(hiddenParticipantIds);

		const fullChatInclude = {
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
						},
					},
				},
			},
		} as const;

		const loadChats = await this.prisma.chatRoom.findMany({
			where: { loadId, type: 'LOAD' },
			include: fullChatInclude,
			orderBy: [{ isLoadArchived: 'asc' }, { createdAt: 'desc' }],
		});

		const events: LoadChatStaffSyncEvent[] = [];

		for (const chat of loadChats) {
			const currentStaff = chat.participants.filter(
				(p) => !isDriverUserRole(p.user?.role),
			);
			const currentByKey = new Map<
				string,
				{ userId: string; key: string; externalId: string; role: string }
			>();
			for (const p of currentStaff) {
				const externalId = trimExternalId(p.user?.externalId);
				const role = String(p.user?.role ?? '');
				const key = userExternalRoleKey(externalId, role);
				// First wins; duplicate keys should not exist in a chat.
				if (!currentByKey.has(key)) {
					currentByKey.set(key, {
						userId: p.userId,
						key,
						externalId,
						role,
					});
				}
			}
			const currentKeySet = new Set(currentByKey.keys());
			const currentStaffIds = currentStaff.map((p) => p.userId);
			const currentStaffSet = new Set(currentStaffIds);

			const toAdd = [...desiredByKey.values()]
				.filter((entry) => !currentKeySet.has(entry.key))
				.map((entry) => entry.userId)
				.filter((userId, index, arr) => arr.indexOf(userId) === index)
				.filter((userId) => !currentStaffSet.has(userId));

			const toRemove = [...currentByKey.values()]
				.filter((entry) => !desiredKeySet.has(entry.key))
				.map((entry) => entry.userId)
				.filter((userId, index, arr) => arr.indexOf(userId) === index)
				// Same person still desired under another key — keep membership.
				.filter((userId) => !desiredStaffIds.includes(userId));

			if (toAdd.length === 0 && toRemove.length === 0) {
				continue;
			}

			this.logger.log(
				`[update_load_chat] Syncing non-driver participants: ${JSON.stringify({
					loadId,
					chatRoomId: chat.id,
					desiredKeys: [...desiredKeySet],
					currentKeys: [...currentKeySet],
					desiredStaffIds,
					currentStaffIds,
					toAdd,
					toRemove,
				})}`,
			);

			const addedJoinedAt = newParticipantJoinedAt();

			await this.prisma.$transaction(async (tx) => {
				for (const userId of toRemove) {
					await tx.chatRoomParticipant.delete({
						where: {
							chatRoomId_userId: {
								chatRoomId: chat.id,
								userId,
							},
						},
					});
				}

				for (const userId of toAdd) {
					await tx.chatRoomParticipant.create({
						data: {
							chatRoomId: chat.id,
							userId,
							isHidden: false,
							hideParticipant: hiddenIdSet.has(userId),
							joinedAt: addedJoinedAt,
						},
					});
				}

				const retained = desiredStaffIds.filter((id) => currentStaffSet.has(id));
				for (const userId of retained) {
					await tx.chatRoomParticipant.update({
						where: {
							chatRoomId_userId: {
								chatRoomId: chat.id,
								userId,
							},
						},
						data: {
							hideParticipant: hiddenIdSet.has(userId),
						},
					});
				}

				await tx.chatRoom.update({
					where: { id: chat.id },
					data: { updatedAt: nowInNewYorkAsNaiveDate() },
				});
			});

			const completeChatRoom = await this.prisma.chatRoom.findUnique({
				where: { id: chat.id },
				include: fullChatInclude,
			});
			if (!completeChatRoom) {
				throw new InternalServerErrorException(
					`LOAD chat ${chat.id} not found after staff participant sync`,
				);
			}

			const newParticipants =
				toAdd.length > 0
					? await this.prisma.chatRoomParticipant.findMany({
							where: {
								chatRoomId: chat.id,
								userId: { in: toAdd },
							},
							include: {
								user: {
									select: {
										id: true,
										firstName: true,
										lastName: true,
										role: true,
										profilePhoto: true,
										userColor: true,
										externalId: true,
									},
								},
							},
						})
					: [];

			events.push({
				chatRoomId: chat.id,
				chatRoom: completeChatRoom,
				newParticipants,
				addedUserIds: toAdd,
				removedUserIds: toRemove,
			});
		}

		return events;
	}

	/**
	 * Resolve non-driver request participants + auto-added ADMINISTRATOR users
	 * (same rules as create_load_chat). Identity key is externalId + role.
	 */
	private async resolveLoadChatStaffParticipants(
		participants: Array<{ id: string; role: string }>,
		options?: { excludeUserIds?: string[]; requireAllResolved?: boolean },
	): Promise<{
		staffParticipants: Array<{
			userId: string;
			externalId: string;
			role: string;
			key: string;
		}>;
		staffParticipantIds: string[];
		hiddenParticipantIds: string[];
		unresolvedStaff: Array<{ id: string; role: string }>;
	}> {
		const excludeUserIds = new Set(options?.excludeUserIds ?? []);
		const staffParticipants: Array<{
			userId: string;
			externalId: string;
			role: string;
			key: string;
		}> = [];
		const seenKeys = new Set<string>();
		const unresolvedStaff: Array<{ id: string; role: string }> = [];

		for (const participant of participants) {
			if (isDriverParticipantRole(participant.role)) {
				continue;
			}

			const externalId = trimExternalId(participant.id);
			const key = participantExternalRoleKey(externalId, participant.role);
			if (!externalId || seenKeys.has(key)) {
				continue;
			}

			try {
				const user = await findSingleUserByExternalIdAndParticipantRole(
					this.prisma,
					participant.id,
					participant.role,
					{ id: true, externalId: true, role: true },
				);
				if (user && !excludeUserIds.has(user.id)) {
					seenKeys.add(key);
					staffParticipants.push({
						userId: user.id,
						externalId: trimExternalId(user.externalId) || externalId,
						role: String(user.role),
						// Keep request role in the comparison key so TMS payload is source of truth.
						key,
					});
				} else if (!user) {
					unresolvedStaff.push({
						id: externalId,
						role: participant.role,
					});
				}
			} catch (error) {
				this.mapExternalIdLookupError(error);
			}
		}

		if (options?.requireAllResolved && unresolvedStaff.length > 0) {
			const details = unresolvedStaff
				.map((p) => `${p.id} (${p.role})`)
				.join(', ');
			throw new BadRequestException(
				`Cannot sync LOAD chat participants: unresolved non-driver externalId(s): ${details}`,
			);
		}

		const adminUsers = await this.prisma.user.findMany({
			where: {
				role: {
					in: ['ADMINISTRATOR'],
				},
				AND: ADMIN_EXTERNAL_IDS_EXCLUDED_FROM_LOAD_CHAT_AUTOPARTICIPANTS.map(
					(externalId) => ({
						NOT: { externalId },
					}),
				),
			},
			select: {
				id: true,
				externalId: true,
				role: true,
			},
		});

		const hiddenParticipantIds: string[] = [];
		const staffParticipantIds = staffParticipants.map((entry) => entry.userId);
		for (const user of adminUsers) {
			if (
				staffParticipantIds.includes(user.id) ||
				excludeUserIds.has(user.id)
			) {
				continue;
			}
			const externalId = trimExternalId(user.externalId);
			const key = userExternalRoleKey(externalId, user.role);
			if (seenKeys.has(key)) {
				continue;
			}
			seenKeys.add(key);
			staffParticipants.push({
				userId: user.id,
				externalId,
				role: String(user.role),
				key,
			});
			staffParticipantIds.push(user.id);
			hiddenParticipantIds.push(user.id);
		}

		return {
			staffParticipants,
			staffParticipantIds,
			hiddenParticipantIds,
			unresolvedStaff,
		};
	}

	/** @deprecated Prefer resolveLoadChatStaffParticipants — kept for create path IDs. */
	private async resolveLoadChatStaffParticipantIds(
		participants: Array<{ id: string; role: string }>,
		options?: { excludeUserIds?: string[]; requireAllResolved?: boolean },
	): Promise<{
		staffParticipantIds: string[];
		hiddenParticipantIds: string[];
		unresolvedStaff: Array<{ id: string; role: string }>;
	}> {
		const resolved = await this.resolveLoadChatStaffParticipants(
			participants,
			options,
		);
		return {
			staffParticipantIds: resolved.staffParticipantIds,
			hiddenParticipantIds: resolved.hiddenParticipantIds,
			unresolvedStaff: resolved.unresolvedStaff,
		};
	}

	/** Remove trailing "(externalId First Last)" suffix from a LOAD chat title. */
	private stripLoadChatDriverSuffix(name: string | null | undefined): string {
		return String(name ?? '')
			.trim()
			.replace(/\s*\([^)]*\)\s*$/, '')
			.trim();
	}
}
