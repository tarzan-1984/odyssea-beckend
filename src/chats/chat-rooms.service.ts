import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
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
import {
	AmbiguousExternalIdError,
	ChatParticipantRef,
	ExternalIdRoleRequiredError,
	findSingleUserByExternalIdAndParticipantRole,
	participantRoleCategoryKey,
	resolveParticipantUser,
	userRoleCategoryKey,
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

		// For group chats, ensure at least 2 participants
		if (type === 'GROUP' && participantIds.length < 2) {
			throw new BadRequestException(
				'Group chats must have at least 2 participants',
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
					// for GROUP chats, set creator as admin; DIRECT and OFFER have no admin
					adminId: type === 'GROUP' ? creatorId : null,
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
			} else if (type === 'GROUP') {
				try {
					// Create notifications for group chat participants (except admin)
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
				OR: [{ type: { not: 'LOAD' } }, { type: 'LOAD', isLoadArchived: false }],
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
	 * Add new participants to an existing chat room.
	 * Each participant is resolved by internal user id, or by externalId + role (driver vs employee).
	 */
	async addParticipants(
		chatRoomId: string,
		participantIds: string[],
		userId: string,
		participantRefs?: ChatParticipantRef[],
	) {
		const refs = await this.buildParticipantRefs(participantIds, participantRefs);

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
		}> = [];
		const resolvedUserIds: string[] = [];

		for (const ref of refs) {
			const resolved = await this.resolveParticipantUserOrThrow(ref, {
				id: true,
				firstName: true,
				lastName: true,
				role: true,
			});

			if (!resolvedUserIds.includes(resolved.id)) {
				resolvedUserIds.push(resolved.id);
				resolvedUsers.push(resolved);
			}
		}

		const joinedAt = newParticipantJoinedAt();

		// Add new participants
		const newParticipants = await Promise.all(
			resolvedUserIds.map((participantId) =>
				this.prisma.chatRoomParticipant.create({
					data: {
						chatRoomId,
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

		// Create notifications for all participants (including newly added ones) except admin
		if (chatRoom.type === 'GROUP' && resolvedUsers.length > 0) {
			try {
				// Get all participants (existing + newly added)
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
					userId,
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
		const isGroupChat = chatRoom.type === 'GROUP';

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
	 * For GROUP chats: remove participant if regular user, delete completely if admin
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
		} else if (chatRoom.type === 'GROUP') {
			// For GROUP chats: check if user is admin
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
	 * Create a LOAD chat with external participants, or no-op if one already exists,
	 * or convert the selected driver's OFFER chat when an offer matches load_id.
	 */
	async createLoadChat(createLoadChatDto: CreateLoadChatDto): Promise<CreateLoadChatResult> {
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

		const existingLoad = await this.prisma.chatRoom.findFirst({
			where: { type: 'LOAD', loadId: load_id },
			include: fullChatInclude,
		});
		if (existingLoad) {
			return { chatRoom: existingLoad, kind: 'noop', hardDeletedChats: [] };
		}

		const driverParticipant = participants.find((p) => p.role.toUpperCase() === 'DRIVER');
		if (!driverParticipant) {
			throw new BadRequestException('Driver participant is required');
		}

		const driver = await (async () => {
			try {
				return await findSingleUserByExternalIdAndParticipantRole(
					this.prisma,
					driverParticipant.id,
					driverParticipant.role,
					{ id: true, status: true },
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

		const validParticipantIds: string[] = [driver.id];
		for (const participant of participants) {
			if (participant.role.toUpperCase() === 'DRIVER') {
				continue;
			}

			try {
				const user = await findSingleUserByExternalIdAndParticipantRole(
					this.prisma,
					participant.id,
					participant.role,
					{ id: true },
				);
				if (user) {
					validParticipantIds.push(user.id);
				}
			} catch (error) {
				this.mapExternalIdLookupError(error);
			}
		}

		// Auto-add administrators as hidden participants, except excluded TMS/external IDs
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
			},
		});

		const hiddenParticipantIds: string[] = [];
		for (const user of adminUsers) {
			if (!validParticipantIds.includes(user.id)) {
				validParticipantIds.push(user.id);
				hiddenParticipantIds.push(user.id);
			}
		}

		const hiddenIdSet = new Set(hiddenParticipantIds);
		const desiredUnique = [...new Set(validParticipantIds)];

		const offer = await this.prisma.offer.findFirst({
			where: { loadId: load_id },
			orderBy: { id: 'asc' },
		});

		if (offer) {
			const selectedRate = await this.prisma.rateOffer.findFirst({
				where: { offerId: offer.id, isSelected: true },
				orderBy: { id: 'asc' },
			});
			const selectedDriverExternalId = selectedRate?.driverId?.trim() || null;

			if (selectedDriverExternalId) {
				const requestDriverExt = driverParticipant.id.trim();
				if (requestDriverExt !== selectedDriverExternalId) {
					throw new BadRequestException(
						`Driver external id in request must match selected driver for offer (expected ${selectedDriverExternalId})`,
					);
				}

				const selectedOfferChat = await this.prisma.chatRoom.findFirst({
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

				if (selectedOfferChat) {
					const otherOfferChats = await this.prisma.chatRoom.findMany({
						where: {
							type: 'OFFER',
							offerId: offer.id,
							id: { not: selectedOfferChat.id },
						},
						include: { participants: { select: { userId: true } } },
					});

					const hardDeletedChats: CreateLoadChatHardDeletion[] = otherOfferChats.map(
						(r) => ({
							chatRoomId: r.id,
							notifyUserIds: r.participants.map((p) => p.userId),
						}),
					);

					const beforeUserIds = new Set(
						selectedOfferChat.participants.map((p) => p.userId),
					);

					const toRemove = [...beforeUserIds].filter((id) => !desiredUnique.includes(id));
					const toAdd = desiredUnique.filter((id) => !beforeUserIds.has(id));

					await this.prisma.$transaction(async (tx) => {
						if (otherOfferChats.length > 0) {
							await tx.chatRoom.deleteMany({
								where: { id: { in: otherOfferChats.map((c) => c.id) } },
							});
						}

						await tx.chatRoom.update({
							where: { id: selectedOfferChat.id },
							data: {
								type: 'LOAD',
								loadId: load_id,
								name: title,
								company,
								updatedAt: nowInNewYorkAsNaiveDate(),
							},
						});

						const addedJoinedAt = newParticipantJoinedAt();

						for (const userId of toRemove) {
							await tx.chatRoomParticipant.delete({
								where: {
									chatRoomId_userId: {
										chatRoomId: selectedOfferChat.id,
										userId,
									},
								},
							});
						}

						for (const userId of toAdd) {
							await tx.chatRoomParticipant.create({
								data: {
									chatRoomId: selectedOfferChat.id,
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
										chatRoomId: selectedOfferChat.id,
										userId,
									},
								},
								data: {
									hideParticipant: hiddenIdSet.has(userId),
								},
							});
						}
					});

					const newParticipants =
						toAdd.length > 0
							? await this.prisma.chatRoomParticipant.findMany({
								where: {
									chatRoomId: selectedOfferChat.id,
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

					const completeChatRoom = await this.prisma.chatRoom.findUnique({
						where: { id: selectedOfferChat.id },
						include: fullChatInclude,
					});

					if (!completeChatRoom) {
						throw new InternalServerErrorException(
							'Converted LOAD chat not found after transaction',
						);
					}

					return {
						chatRoom: completeChatRoom,
						kind: 'converted',
						hardDeletedChats,
						conversionParticipantEvents: {
							chatRoomId: selectedOfferChat.id,
							newParticipants,
							addedUserIds: toAdd,
							removedUserIds: toRemove,
						},
					};
				}
			}
		}

		// Another request may have created or converted LOAD while we resolved participants / offer path
		const existingAfterOffer = await this.prisma.chatRoom.findFirst({
			where: { type: 'LOAD', loadId: load_id },
			include: fullChatInclude,
		});
		if (existingAfterOffer) {
			return { chatRoom: existingAfterOffer, kind: 'noop', hardDeletedChats: [] };
		}

		try {
			const outcome = await this.prisma.$transaction(async (prisma) => {
				const dup = await prisma.chatRoom.findFirst({
					where: { type: 'LOAD', loadId: load_id },
					include: fullChatInclude,
				});
				if (dup) {
					return { tag: 'noop' as const, chatRoom: dup };
				}

				const roomTimestamps = newChatRoomTimestamps();
				const joinedAt = newParticipantJoinedAt(roomTimestamps.createdAt);

				const chatRoom = await prisma.chatRoom.create({
					data: {
						name: title,
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
					throw new InternalServerErrorException('LOAD chat not found after creation');
				}
				return { tag: 'created' as const, chatRoom: full };
			});

			if (outcome.tag === 'noop') {
				return { chatRoom: outcome.chatRoom, kind: 'noop', hardDeletedChats: [] };
			}

			return {
				chatRoom: outcome.chatRoom,
				kind: 'created',
				hardDeletedChats: [],
			};
		} catch (e) {
			if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
				const existing = await this.prisma.chatRoom.findFirst({
					where: { type: 'LOAD', loadId: load_id },
					include: fullChatInclude,
				});
				if (existing) {
					return { chatRoom: existing, kind: 'noop', hardDeletedChats: [] };
				}
			}
			throw e;
		}
	}

	/**
	 * Update LOAD chat participants by load_id
	 * - Roles from payload are case-insensitive
	 * - Hidden participants (hideParticipant=true) remain untouched
	 * - Adds missing participants and removes those not in the new list
	 */
	async updateLoadChatParticipants(updateDto: UpdateLoadChatDto) {
		const loadId = updateDto.load_id;

		// Find chat room by loadId and type LOAD
		const chatRoom = await this.prisma.chatRoom.findFirst({
			where: { loadId: loadId, type: 'LOAD' },
			include: {
				participants: {
					include: { user: { select: { id: true, externalId: true, role: true } } },
				},
			},
		});

		if (!chatRoom) {
			throw new NotFoundException('LOAD chat with specified load_id not found');
		}

		// Map current participants by externalId + role category (skip hidden ones)
		const visibleParticipants = chatRoom.participants.filter(
			(p: any) => p.hideParticipant !== true,
		);

		// Resolve incoming external IDs to user IDs using payload role (DRIVER vs employee).
		const incomingUsers: Array<{ id: string; externalId: string; role: string }> = [];
		const foundParticipantKeys = new Set<string>();
		const incomingByCategoryKey = new Map<string, string>();

		for (const participant of updateDto.participants) {
			const extId = participant.id?.trim();
			if (!extId) continue;

			let user: { id: string; externalId: string | null; role: string } | null;
			try {
				user = await findSingleUserByExternalIdAndParticipantRole(
					this.prisma,
					extId,
					participant.role,
					{ id: true, externalId: true, role: true },
				);
			} catch (error) {
				this.mapExternalIdLookupError(error);
			}

			if (!user?.externalId) continue;

			const categoryKey = participantRoleCategoryKey(extId, participant.role);
			foundParticipantKeys.add(categoryKey);
			incomingByCategoryKey.set(categoryKey, user.id);

			if (!incomingUsers.some((row) => row.id === user!.id)) {
				incomingUsers.push({
					id: user.id,
					externalId: user.externalId,
					role: user.role,
				});
			}
		}
		const notFoundExternalIds = updateDto.participants
			.filter(
				(participant) =>
					!foundParticipantKeys.has(
						participantRoleCategoryKey(participant.id, participant.role),
					),
			)
			.map((participant) => participant.id);

		// Determine users to add and to remove
		const incomingUserIds = new Set<string>(incomingUsers.map((u) => u.id));
		const currentUserIds = new Set<string>(visibleParticipants.map((p: any) => p.userId));

		const toAdd: string[] = [];
		for (const uid of incomingUserIds) {
			if (!currentUserIds.has(uid)) toAdd.push(uid);
		}

		const toRemove: string[] = [];
		const toRemoveSet = new Set<string>();
		for (const uid of currentUserIds) {
			if (!incomingUserIds.has(uid)) {
				toRemove.push(uid);
				toRemoveSet.add(uid);
			}
		}

		// Drop stale visible participants that share externalId+category with incoming list
		for (const participant of visibleParticipants) {
			const externalId = participant.user?.externalId?.trim();
			const userRole = participant.user?.role;
			if (!externalId || !userRole) continue;

			const categoryKey = userRoleCategoryKey(externalId, userRole);
			const expectedUserId = incomingByCategoryKey.get(categoryKey);
			if (
				expectedUserId &&
				expectedUserId !== participant.userId &&
				!toRemoveSet.has(participant.userId)
			) {
				toRemove.push(participant.userId);
				toRemoveSet.add(participant.userId);
			}
		}

		// Preserve original participants list for notifications (before changes)
		const originalParticipants = chatRoom.participants.map((p: any) => ({ userId: p.userId }));

		// Apply changes in a transaction
		const joinedAt = newParticipantJoinedAt();

		await this.prisma.$transaction(async (tx) => {
			if (toAdd.length > 0) {
				await tx.chatRoomParticipant.createMany({
					data: toAdd.map((userId) => ({
						chatRoomId: chatRoom.id,
						userId,
						joinedAt,
					})),
				});
			}

			for (const userId of toRemove) {
				await tx.chatRoomParticipant.delete({
					where: { chatRoomId_userId: { chatRoomId: chatRoom.id, userId } },
				});
			}
		});

		// Build participants payload for WebSocket events
		const newParticipants = toAdd.length
			? await this.prisma.chatRoomParticipant.findMany({
				where: { chatRoomId: chatRoom.id, userId: { in: toAdd } },
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
			})
			: [];

		// Create DB notifications similar to GROUP chat behavior
		try {
			// Added participants notifications
			if (toAdd.length > 0) {
				const addedUsers = await this.prisma.user.findMany({
					where: { id: { in: toAdd } },
					select: { id: true, firstName: true, lastName: true },
				});

				const allParticipantsAfterAdd = [
					...originalParticipants,
					...toAdd.map((id) => ({ userId: id })),
				];

				await this.notificationsService.createParticipantsAddedNotifications(
					addedUsers,
					{ id: chatRoom.id, name: chatRoom.name, avatar: chatRoom.avatar },
					allParticipantsAfterAdd,
					'system',
				);
			}

			// Removed participants notifications (notify all including removed, exclude none)
			if (toRemove.length > 0) {
				for (const removedId of toRemove) {
					const removedUser = await this.prisma.user.findUnique({
						where: { id: removedId },
						select: { id: true, firstName: true, lastName: true },
					});
					if (removedUser) {
						await this.notificationsService.createParticipantRemovedNotifications(
							removedUser,
							{ id: chatRoom.id, name: chatRoom.name, avatar: chatRoom.avatar },
							originalParticipants, // before removal includes the removed one
							'system',
						);
					}
				}
			}
		} catch (e) {
			// Do not block update on notification errors
			console.error('Failed to create notifications for LOAD chat update:', e);
		}

		return {
			chatRoomId: chatRoom.id,
			addedUserIds: toAdd,
			removedUserIds: toRemove,
			newParticipants,
			notFoundExternalIds,
		};
	}
}
