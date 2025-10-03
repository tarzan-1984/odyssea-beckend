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

		// Create message
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
			},
			include: {
				sender: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						avatar: true,
						role: true,
					},
				},
				receiver: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						avatar: true,
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

		return message;
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
						avatar: true,
						role: true,
					},
				},
				receiver: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						avatar: true,
						role: true,
					},
				},
			},
		});

		// Mark messages as read for the current user
		await this.markMessagesAsRead(chatRoomId, userId);

		return {
			messages: messages,
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
	 * Mark messages as read for a specific user in a chat room
	 * This is called when user opens the chat or scrolls through messages
	 */
	async markMessagesAsRead(chatRoomId: string, userId: string) {
		await this.prisma.message.updateMany({
			where: {
				chatRoomId,
				receiverId: userId,
				isRead: false,
			},
			data: {
				isRead: true,
			},
		});
	}

	/**
	 * Get unread message count for a user across all chat rooms
	 */
	async getUnreadCount(userId: string) {
		const unreadCount = await this.prisma.message.count({
			where: {
				receiverId: userId,
				isRead: false,
			},
		});

		return { unreadCount };
	}

	/**
	 * Delete a message (only by sender)
	 */
	async deleteMessage(messageId: string, userId: string) {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
		});

		if (!message) {
			throw new NotFoundException('Message not found');
		}

		if (message.senderId !== userId) {
			throw new BadRequestException(
				'You can only delete your own messages',
			);
		}

		// Soft delete - mark as deleted but keep in database
		return await this.prisma.message.update({
			where: { id: messageId },
			data: {
				content: '[Message deleted]',
				fileUrl: null,
				fileName: null,
				fileSize: null,
			},
		});
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
							avatar: true,
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
