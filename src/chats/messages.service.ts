import {
	Injectable,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class MessagesService {
	constructor(private prisma: PrismaService) {}

	/**
	 * Send a message to a chat room
	 * This method handles text messages and file attachments
	 */
	async sendMessage(sendMessageDto: SendMessageDto, senderId: string) {
		const { chatRoomId, content, fileUrl, fileName, fileSize } =
			sendMessageDto;

		// Verify sender is participant in the chat room
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId: senderId,
				},
			},
		});

		if (!participant) {
			throw new BadRequestException(
				'You are not a participant in this chat room',
			);
		}

		// Get all participants to determine receivers
		const participants = await this.prisma.chatRoomParticipant.findMany({
			where: { chatRoomId },
			select: { userId: true },
		});

		// Create message with sender automatically marked as read
		const message = await this.prisma.message.create({
			data: {
				chatRoomId,
				senderId,
				content,
				fileUrl,
				fileName,
				fileSize,
				// For direct chats, set receiverId; for group chats, leave null
				receiverId:
					participants.length === 2
						? participants.find((p) => p.userId !== senderId)
								?.userId
						: null,
				// Sender is automatically marked as having read the message
				isRead: false, // Global read status starts as false (no one has read it yet)
				readBy: [senderId], // Only sender is in readBy array initially
			},
			include: {
				sender: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						role: true,
					},
				},
				receiver: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						role: true,
					},
				},
			},
		});

		// Update chat room's updatedAt timestamp
		await this.prisma.chatRoom.update({
			where: { id: chatRoomId },
			data: { updatedAt: new Date() },
		});

		// Transform profilePhoto to avatar for frontend compatibility
		const transformedMessage = {
			...message,
			sender: {
				...message.sender,
				avatar: message.sender.profilePhoto,
				profilePhoto: undefined,
			},
			receiver: message.receiver
				? {
						...message.receiver,
						avatar: message.receiver.profilePhoto,
						profilePhoto: undefined,
					}
				: undefined,
			// Add isRead field for WebSocket compatibility (always false for new messages)
			isRead: message.isRead,
		};

		return transformedMessage;
	}

	/**
	 * Get messages for a specific chat room with pagination
	 * For chat: gets the most recent messages first, then older ones for infinite scroll
	 */
	async getChatRoomMessages(
		chatRoomId: string,
		userId: string,
		page: number = 1,
		limit: number = 50,
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

		// Get total count first
		const total = await this.prisma.message.count({
			where: { chatRoomId },
		});

		// For chat, we want to get the most recent messages
		// If page = 1, get the last 'limit' messages
		// If page > 1, get older messages (for infinite scroll)
		let skip: number;
		let orderBy: { createdAt: 'asc' | 'desc' };

		if (page === 1) {
			// First page: get the most recent messages
			skip = Math.max(0, total - limit);
			orderBy = { createdAt: 'asc' }; // We'll reverse this later
		} else {
			// Subsequent pages: get older messages
			skip = Math.max(0, total - page * limit);
			orderBy = { createdAt: 'asc' }; // We'll reverse this later
		}

		const messages = await this.prisma.message.findMany({
			where: { chatRoomId },
			orderBy,
			skip,
			take: limit,
			include: {
				sender: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						role: true,
					},
				},
				receiver: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						role: true,
					},
				},
			},
		});

		// Note: Messages are no longer automatically marked as read when fetching
		// They will be marked as read via WebSocket when user actually views them
		// await this.markMessagesAsRead(chatRoomId, userId);

		// Transform profilePhoto to avatar for frontend compatibility
		const transformedMessages = messages.map((message) => ({
			...message,
			sender: {
				...message.sender,
				avatar: message.sender.profilePhoto,
				profilePhoto: undefined,
			},
			receiver: message.receiver
				? {
						...message.receiver,
						avatar: message.receiver.profilePhoto,
						profilePhoto: undefined,
					}
				: undefined,
		}));

		return {
			messages: transformedMessages,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
				hasMore: skip > 0, // There are more older messages if skip > 0
			},
		};
	}

	/**
	 * Mark a specific message as read
	 * This is called when user views a specific message
	 */
	async markMessageAsRead(messageId: string, userId: string) {
		// Get the message to check if it's from a group chat or direct chat
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: { 
				id: true, 
				senderId: true, 
				receiverId: true, 
				chatRoomId: true,
				readBy: true 
			},
		});

		if (!message || message.senderId === userId) {
			return; // Don't mark own messages
		}

		// Check if user already read this message
		const readBy = message.readBy as string[] || [];
		const alreadyRead = readBy.includes(userId);
		
		if (alreadyRead) {
			return; // Already read
		}

		// Add user to readBy array
		const updatedReadBy = [...readBy, userId];

		// Update both isRead (global) and readBy (per-user)
		await this.prisma.message.update({
			where: { id: messageId },
			data: { 
				isRead: true, // Global read status
				readBy: updatedReadBy // Per-user read status
			},
		});
	}

	/**
	 * Mark a specific message as UNREAD
	 * Reverts read status and notifies chat participants via WebSocket (if provided)
	 */
	async markMessageAsUnread(
		messageId: string,
		userId: string,
		chatGateway?: any,
	) {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: {
				id: true,
				senderId: true,
				chatRoomId: true,
				readBy: true,
				isRead: true,
			},
		});

		if (!message) {
			throw new NotFoundException('Message not found');
		}

		// Disallow marking own messages as unread
		if (message.senderId === userId) {
			throw new BadRequestException('Cannot mark your own message as unread');
		}

		// Get chat room type to determine logic
		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: message.chatRoomId },
			select: { type: true, participants: { select: { userId: true } } },
		});

		if (!chatRoom) {
			throw new NotFoundException('Chat room not found');
		}

		// Check if user already marked as unread
		const readBy = message.readBy as string[] || [];
		const userReadIndex = readBy.indexOf(userId);
		
		if (userReadIndex === -1) {
			return { success: true, messageId, chatRoomId: message.chatRoomId };
		}

		// Remove user from readBy array
		const updatedReadBy = readBy.filter(id => id !== userId);

		// Apply different logic based on chat type
		if (chatRoom.type === 'DIRECT') {
			// For DIRECT chats: set both isRead to false and remove user from readBy
			await this.prisma.message.update({
				where: { id: messageId },
				data: { 
					isRead: false, // Global read status becomes false
					readBy: updatedReadBy // Remove user from readBy
				},
			});
		} else {
			// For GROUP and LOAD chats: only remove user from readBy, keep isRead as true
			await this.prisma.message.update({
				where: { id: messageId },
				data: { readBy: updatedReadBy },
			});
		}

		if (chatGateway) {
			chatGateway.server
				.to(`chat_${message.chatRoomId}`)
				.emit('messagesMarkedAsUnread', {
					chatRoomId: message.chatRoomId,
					messageIds: [messageId],
					userId,
				});
		}

		return { success: true, messageId, chatRoomId: message.chatRoomId };
	}

	/**
	 * Mark messages as read for a specific user in a chat room
	 * This is called when user opens the chat or scrolls through messages
	 * For group chats, marks all messages except user's own messages
	 * For direct chats, marks messages where user is the receiver
	 */
	async markMessagesAsRead(chatRoomId: string, userId: string): Promise<string[]> {
		// Get all messages in this chat room that the user hasn't read yet
		const messages = await this.prisma.message.findMany({
			where: {
				chatRoomId,
				senderId: { not: userId }, // Not sent by current user
			},
			select: {
				id: true,
				readBy: true,
			},
		});

		const messagesToUpdate: string[] = [];

		// Process each message
		for (const message of messages) {
			const readBy = message.readBy as string[] || [];
			const alreadyRead = readBy.includes(userId);
			
			if (!alreadyRead) {
				// Add user to readBy array
				const updatedReadBy = [...readBy, userId];

				await this.prisma.message.update({
					where: { id: message.id },
					data: { 
						isRead: true, // Global read status
						readBy: updatedReadBy // Per-user read status
					},
				});

				messagesToUpdate.push(message.id);
			}
		}

		return messagesToUpdate;
	}

	/**
	 * Get unread message count for a user across all chat rooms
	 */
	async getUnreadCount(userId: string) {
		// Get all chat rooms where user is a participant
		const userChatRooms = await this.prisma.chatRoomParticipant.findMany({
			where: { userId },
			select: { chatRoomId: true },
		});

		const chatRoomIds = userChatRooms.map(room => room.chatRoomId);

		// Get all messages not sent by user in their chat rooms
		const messages = await this.prisma.message.findMany({
			where: {
				chatRoomId: { in: chatRoomIds },
				senderId: { not: userId },
			},
			select: {
				id: true,
				readBy: true,
			},
		});

		// Count messages where user is not in readBy array
		let unreadCount = 0;
		for (const message of messages) {
			const readBy = message.readBy as string[] || [];
			const isRead = readBy.includes(userId);
			if (!isRead) {
				unreadCount++;
			}
		}

		return { unreadCount };
	}

	/**
	 * Delete a message (only by sender)
	 */
	async deleteMessage(messageId: string, userId: string, userRole?: string, chatGateway?: any) {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			include: {
				chatRoom: {
					include: {
						participants: {
							select: { userId: true }
						}
					}
				}
			}
		});

		if (!message) {
			throw new NotFoundException('Message not found');
		}

		// Check if user can delete the message
		// Users can delete their own messages, admins can delete any message
		const isAdmin = userRole === 'ADMINISTRATOR';
		const isOwner = message.senderId === userId;

		if (!isOwner && !isAdmin) {
			throw new BadRequestException(
				'You can only delete your own messages or be an administrator',
			);
		}

		// Hard delete the message from database
		await this.prisma.message.delete({
			where: { id: messageId },
		});

		// Send WebSocket notification to all participants in the chat room
		if (chatGateway) {
			const participantIds = message.chatRoom.participants.map(p => p.userId);
			
			// Emit to all participants in the chat room
			chatGateway.server.to(`chat_${message.chatRoomId}`).emit('messageDeleted', {
				messageId,
				chatRoomId: message.chatRoomId,
				deletedBy: userId,
				deletedByRole: userRole
			});

			// Also emit to individual users who might not be in the room
			participantIds.forEach(participantId => {
				chatGateway.server.emit('messageDeleted', {
					messageId,
					chatRoomId: message.chatRoomId,
					deletedBy: userId,
					deletedByRole: userRole
				});
			});
		}

		return { 
			success: true, 
			messageId, 
			chatRoomId: message.chatRoomId,
			deletedBy: userId 
		};
	}

	/**
	 * Search messages in a chat room
	 * Useful for finding specific information in chat history
	 */
	async searchMessages(
		chatRoomId: string,
		userId: string,
		query: string,
		page: number = 1,
		limit: number = 20,
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

		const skip = (page - 1) * limit;

		const [messages, total] = await Promise.all([
			this.prisma.message.findMany({
				where: {
					chatRoomId,
					content: {
						contains: query,
						mode: 'insensitive', // Case-insensitive search
					},
				},
				orderBy: { createdAt: 'asc' },
				skip,
				take: limit,
				include: {
					sender: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							profilePhoto: true,
							role: true,
						},
					},
				},
			}),
			this.prisma.message.count({
				where: {
					chatRoomId,
					content: {
						contains: query,
						mode: 'insensitive',
					},
				},
			}),
		]);

		return {
			messages,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Get message statistics for analytics
	 * Useful for managers to monitor communication activity
	 */
	async getMessageStats(chatRoomId: string, userId: string) {
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

		const [totalMessages, messagesToday, messagesThisWeek, fileMessages] =
			await Promise.all([
				this.prisma.message.count({
					where: { chatRoomId },
				}),
				this.prisma.message.count({
					where: {
						chatRoomId,
						createdAt: {
							gte: new Date(new Date().setHours(0, 0, 0, 0)),
						},
					},
				}),
				this.prisma.message.count({
					where: {
						chatRoomId,
						createdAt: {
							gte: new Date(
								new Date().setDate(new Date().getDate() - 7),
							),
						},
					},
				}),
				this.prisma.message.count({
					where: {
						chatRoomId,
						fileUrl: { not: null },
					},
				}),
			]);

		return {
			totalMessages,
			messagesToday,
			messagesThisWeek,
			fileMessages,
			averageMessagesPerDay:
				totalMessages > 0
					? Math.round(
							(totalMessages /
								Math.max(
									1,
									Math.ceil(
										(Date.now() -
											new Date(
												participant.joinedAt,
											).getTime()) /
											(1000 * 60 * 60 * 24),
									),
								)) *
								100,
						) / 100
					: 0,
		};
	}

	/**
	 * Get message by ID
	 * Used for WebSocket operations like marking messages as read
	 */
	async getMessageById(messageId: string) {
		return await this.prisma.message.findUnique({
			where: { id: messageId },
			include: {
				sender: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
					},
				},
			},
		});
	}
}
