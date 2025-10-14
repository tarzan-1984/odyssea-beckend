import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
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
					const recipient = participants.find(p => p.userId !== creatorId);
					
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
					console.error('Failed to create private chat notification:', error);
				}
			} else if (type === 'GROUP') {
				try {
					// Create notifications for group chat participants (except admin)
					const participantsData = participants.map(p => ({
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
						creatorId
					);
				} catch (error) {
					// Log error but don't fail the chat creation
					console.error('Failed to create group chat notifications:', error);
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
						messages: {
							where: {
								AND: [
									{ receiverId: userId },
									{ isRead: false },
								],
							},
						},
					},
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
		});

		return chatRooms.map((room) => ({
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
			unreadCount: room._count.messages,
		}));
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

		// Add new participants
		return await Promise.all(
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

		// Remove participant
		await this.prisma.chatRoomParticipant.delete({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId: participantId,
				},
			},
		});

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
				await this.prisma.chatRoomParticipant.delete({
					where: {
						chatRoomId_userId: {
							chatRoomId,
							userId,
						},
					},
				});
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
}
