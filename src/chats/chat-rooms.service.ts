import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { UpdateLoadChatDto } from './dto/update-load-chat.dto';
import { CreateLoadChatDto } from './dto/create-load-chat.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ChatRoomsService {
	constructor(
		private prisma: PrismaService,
		private notificationsService: NotificationsService,
	) {}

	/**
	 * Create a new chat room and add participants
	 * This method handles both direct chats between two users and group chats
	 */
	async createChatRoom(
		createChatRoomDto: CreateChatRoomDto,
		creatorId: string,
	) {
		const { name, type, loadId, avatar, participantIds } =
			createChatRoomDto;

		// Validate that creator is included in participants
		if (!participantIds.includes(creatorId)) {
			participantIds.push(creatorId);
		}

		// For direct chats, ensure only 2 participants
		if (type === 'DIRECT' && participantIds.length !== 2) {
			throw new BadRequestException(
				'Direct chats must have exactly 2 participants',
			);
		}

		// For group chats, ensure at least 2 participants
		if (type === 'GROUP' && participantIds.length < 2) {
			throw new BadRequestException(
				'Group chats must have at least 2 participants',
			);
		}

		// Check if direct chat already exists between these users
		if (type === 'DIRECT') {
			const existingDirectChat = await this.findDirectChat(
				participantIds[0],
				participantIds[1],
			);
			if (existingDirectChat) {
				return existingDirectChat;
			}
		}

		// Create chat room and participants in a transaction
		return this.prisma.$transaction(async (prisma) => {
			const defaultName =
				name || (await this.generateDefaultName(type, participantIds));
			const chatRoom = await prisma.chatRoom.create({
				data: {
					name: defaultName,
					type,
					loadId: loadId && loadId.trim() !== '' ? loadId : null,
					avatar,
					// for GROUP chats, set creator as admin
					adminId: type === 'GROUP' ? creatorId : null,
				},
			});

			// Add all participants
			const participants = await Promise.all(
				participantIds.map((userId) =>
					prisma.chatRoomParticipant.create({
						data: {
							chatRoomId: chatRoom.id,
							userId,
						},
						include: {
							user: {
								select: {
									id: true,
									firstName: true,
									lastName: true,
									role: true,
									profilePhoto: true,
								},
							},
						},
					}),
				),
			);

			// Create notifications for chat creation
			if (type === 'DIRECT') {
				try {
					// Get creator user data
					const creator = await prisma.user.findUnique({
						where: { id: creatorId },
						select: {
							id: true,
							firstName: true,
							lastName: true,
							profilePhoto: true,
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
				...chatRoom,
				participants,
			};
		});
	}

	/**
	 * Find a direct chat between two specific users
	 * Used to prevent creating duplicate direct chats
	 */
	private async findDirectChat(userId1: string, userId2: string) {
		return this.prisma.chatRoom.findFirst({
			where: {
				type: 'DIRECT',
				participants: {
					every: {
						userId: {
							in: [userId1, userId2],
						},
					},
				},
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
							},
						},
					},
				},
			},
		});
	}

	/**
	 * Generate default name for chat rooms based on type and participants
	 */
	private async generateDefaultName(
		type: string,
		participantIds: string[],
	): Promise<string> {
		if (type === 'DIRECT') {
			const users = await this.prisma.user.findMany({
				where: { id: { in: participantIds } },
				select: { firstName: true, lastName: true },
			});
			return `${users[0].firstName} ${users[0].lastName} & ${users[1].firstName} ${users[1].lastName}`;
		}
		return `Chat Room ${new Date().toLocaleDateString()}`;
	}

	/**
	 * Get all chat rooms for a specific user
	 * Returns chat rooms with last message and unread count
	 * Filters out hidden DIRECT chats
	 */
	async getUserChatRooms(userId: string) {
		const chatRooms = await this.prisma.chatRoom.findMany({
			where: {
				participants: {
					some: {
						userId,
						isHidden: false, // Exclude hidden chats
					},
				},
				isArchived: false,
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
							},
						},
					},
				},
				messages: {
					orderBy: {
						createdAt: 'desc',
					},
					take: 1,
					include: {
						sender: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								profilePhoto: true,
							},
						},
					},
				},
				_count: {
					select: {
						messages: true,
					},
				},
			},
		});

		// Sort chat rooms by pin status first, then by last message date
		const sortedChatRooms = chatRooms.sort((a, b) => {
			// Get participant data for current user
			const aParticipant = a.participants.find(
				(p) => p.userId === userId,
			);
			const bParticipant = b.participants.find(
				(p) => p.userId === userId,
			);

			// Pinned chats first
			if (aParticipant?.pin && !bParticipant?.pin) return -1;
			if (!aParticipant?.pin && bParticipant?.pin) return 1;

			// If both pinned or both not pinned, sort by last message date
			const aLastMessageDate = a.messages[0]?.createdAt || a.createdAt;
			const bLastMessageDate = b.messages[0]?.createdAt || b.createdAt;
			return bLastMessageDate.getTime() - aLastMessageDate.getTime();
		});

		return sortedChatRooms.map((room) => {
			// Get current user's participant data
			const currentUserParticipant = room.participants.find(
				(p) => p.userId === userId,
			);

			// Calculate unread count for this user
			// We need to fetch all messages and check readBy field
			const unreadCount = 0; // Will be calculated separately in the messages endpoint

			return {
				...room,
				participants: room.participants.map((participant) => ({
					...participant,
					user: {
						...participant.user,
						avatar: participant.user.profilePhoto,
						profilePhoto: undefined,
					},
				})),
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
				// Add user-specific data
				isMuted: currentUserParticipant?.mute || false,
				isPinned: currentUserParticipant?.pin || false,
			};
		});
	}

	/**
	 * Get a specific chat room with its messages and participants
	 */
	async getChatRoom(chatRoomId: string, userId: string) {
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
	 * Add new participants to an existing chat room
	 */
	async addParticipants(
		chatRoomId: string,
		participantIds: string[],
		userId: string,
	) {
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

		// Get info about users being added
		const addedUsers = await this.prisma.user.findMany({
			where: { id: { in: participantIds } },
			select: {
				id: true,
				firstName: true,
				lastName: true,
			},
		});

		// Add new participants
		const newParticipants = await Promise.all(
			participantIds.map((participantId) =>
				this.prisma.chatRoomParticipant.create({
					data: {
						chatRoomId,
						userId: participantId,
					},
					include: {
						user: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								role: true,
								profilePhoto: true,
							},
						},
					},
				}),
			),
		);

		// Create notifications for all participants (including newly added ones) except admin
		if (chatRoom.type === 'GROUP' && addedUsers.length > 0) {
			try {
				// Get all participants (existing + newly added)
				const allParticipants = [
					...chatRoom.participants.map((p) => ({ userId: p.userId })),
					...participantIds.map((id) => ({ userId: id })),
				];

				await this.notificationsService.createParticipantsAddedNotifications(
					addedUsers,
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
							},
						},
					},
				},
			},
		});
	}

	/**
	 * Remove participant from chat room
	 */
	async removeParticipant(
		chatRoomId: string,
		participantId: string,
		userId: string,
	) {
		// removeParticipant invoked via WebSocket

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
		const isLeavingSelf = participantId === userId;
		const isGroupChat = chatRoom.type === 'GROUP';

		// Determine if this is a self-leave in a group chat

		// Get user info before deleting (for notifications)
		const leavingUser = await this.prisma.user.findUnique({
			where: { id: participantId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				profilePhoto: true,
			},
		});

		// Leaving user is needed to build notification avatar/initials

		// Get remaining participants (excluding the leaving user)
		const remainingParticipants = chatRoom.participants
			.filter((p) => p.userId !== participantId)
			.map((p) => ({ userId: p.userId }));

		// Remaining participants to notify

		// Remove participant
		await this.prisma.chatRoomParticipant.delete({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId: participantId,
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

		return { success: true, removedUserId: participantId };
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

		if (chatRoom.type === 'DIRECT') {
			// For DIRECT chats: hide for current user
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

		console.log(
			`Found ${action === 'mute' ? 'unmuted' : 'muted'} participants:`,
			participants,
		);

		if (participants.length === 0) {
			console.log(
				`No ${action === 'mute' ? 'unmuted' : 'muted'} participants found`,
			);
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
		console.log(`Successfully ${action}d chat rooms:`, updatedChatRoomIds);

		return {
			userId,
			mutedCount: participants.length,
			chatRoomIds: updatedChatRoomIds,
		};
	}

	/**
	 * Create a LOAD chat with external participants
	 */
	async createLoadChat(createLoadChatDto: CreateLoadChatDto) {
		const { load_id, title, participants } = createLoadChatDto;

		// Step 1: Find and verify the driver
		const driverParticipant = participants.find((p) => p.role.toUpperCase() === 'DRIVER');
		if (!driverParticipant) {
			throw new BadRequestException('Driver participant is required');
		}

		const driver = await this.prisma.user.findUnique({
			where: { externalId: driverParticipant.id },
		});

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

		// Step 2: Verify all other participants and collect valid user IDs
		const validParticipantIds: string[] = [driver.id];
		const hiddenParticipantIds: string[] = [];

		for (const participant of participants) {
			if (participant.role.toUpperCase() === 'DRIVER') {
				continue; // Already processed
			}

			const user = await this.prisma.user.findUnique({
				where: { externalId: participant.id },
			});

			if (user) {
				validParticipantIds.push(user.id);
			}
		}

		// Step 3: Get all ADMINISTRATOR and BILLING users
		const adminAndBillingUsers = await this.prisma.user.findMany({
			where: {
				role: {
					in: ['ADMINISTRATOR', 'BILLING'],
				},
			},
			select: {
				id: true,
			},
		});

		// Add them to list and mark to hideParticipant flag
		for (const user of adminAndBillingUsers) {
			if (!validParticipantIds.includes(user.id)) {
				validParticipantIds.push(user.id);
				hiddenParticipantIds.push(user.id);
			}
		}

		// Step 4: Create the chat room
		return this.prisma.$transaction(async (prisma) => {
			const chatRoom = await prisma.chatRoom.create({
				data: {
					name: title,
					type: 'LOAD',
					loadId: load_id,
					avatar: null,
					adminId: null, // No admin for LOAD chats
				},
			});

			// Step 5: Add all participants
			const participantsData = validParticipantIds.map((userId) => ({
				chatRoomId: chatRoom.id,
				userId,
				isHidden: false, // chat visible for everyone
				hideParticipant: hiddenParticipantIds.includes(userId), // controls UI-specific hiding logic
			}));

			await prisma.chatRoomParticipant.createMany({
				data: participantsData,
			});

			// Step 6: Fetch the complete chat room with participants
			const completeChatRoom = await prisma.chatRoom.findUnique({
				where: { id: chatRoom.id },
				include: {
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
								},
							},
						},
					},
				},
			});

			return completeChatRoom;
		});
	}

	/**
	 * Update LOAD chat participants by load_id
	 * - Roles from payload are case-insensitive
	 * - Hidden participants (hideParticipant=true) remain untouched
	 * - Adds missing participants and removes those not in the new list
	 */
	async updateLoadChatParticipants(updateDto: UpdateLoadChatDto) {
		const loadId = updateDto.load_id;
		const incomingExternalIds = updateDto.participants.map((p) => p.id);

		// Find chat room by loadId and type LOAD
		const chatRoom = await this.prisma.chatRoom.findFirst({
			where: { loadId: loadId, type: 'LOAD' },
			include: {
				participants: {
					include: { user: { select: { id: true, externalId: true } } },
				},
			},
		});

		if (!chatRoom) {
			throw new NotFoundException('LOAD chat with specified load_id not found');
		}

		// Map current participants by externalId (skip hidden ones)
		const visibleParticipants = chatRoom.participants.filter(
			(p: any) => p.hideParticipant !== true,
		);
		const currentByExternalId = new Map<string, string>(); // externalId -> userId
		for (const p of visibleParticipants) {
			if (p.user?.externalId) currentByExternalId.set(p.user.externalId, p.user.id);
		}

		// Resolve incoming external IDs to user IDs (only existing users)
		const incomingUsers = await this.prisma.user.findMany({
			where: { externalId: { in: incomingExternalIds } },
			select: { id: true, externalId: true },
		});
		const incomingByExternal = new Map(incomingUsers.map((u) => [u.externalId!, u.id]));
		// Determine external IDs that were requested but not found in users table
		const foundExternalSet = new Set<string>(incomingUsers.map((u) => u.externalId!).filter(Boolean));
		const notFoundExternalIds = incomingExternalIds.filter((extId) => !foundExternalSet.has(extId));

		// Determine users to add and to remove
		const incomingUserIds = new Set<string>(incomingUsers.map((u) => u.id));
		const currentUserIds = new Set<string>(visibleParticipants.map((p: any) => p.userId));

		const toAdd: string[] = [];
		for (const uid of incomingUserIds) {
			if (!currentUserIds.has(uid)) toAdd.push(uid);
		}

		const toRemove: string[] = [];
		for (const uid of currentUserIds) {
			if (!incomingUserIds.has(uid)) toRemove.push(uid);
		}

		// Preserve original participants list for notifications (before changes)
		const originalParticipants = chatRoom.participants.map((p: any) => ({ userId: p.userId }));

		// Apply changes in a transaction
		await this.prisma.$transaction(async (tx) => {
			if (toAdd.length > 0) {
				await tx.chatRoomParticipant.createMany({
					data: toAdd.map((userId) => ({ chatRoomId: chatRoom.id, userId })),
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
