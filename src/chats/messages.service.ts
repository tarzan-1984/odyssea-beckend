import {
	Injectable,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { FcmPushService } from '../notifications/fcm-push.service';
import { ExpoPushService } from '../notifications/expo-push.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class MessagesService {
	constructor(
		private prisma: PrismaService,
		private fcmPushService: FcmPushService,
		private expoPushService: ExpoPushService,
	) {}

	/**
	 * Send a message to a chat room
	 * This method handles text messages and file attachments
	 */
	async sendMessage(sendMessageDto: SendMessageDto, senderId: string) {
		const { chatRoomId, content, fileUrl, fileName, fileSize, replyData } =
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
				replyData, // Store reply data as JSON
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

		// Fire-and-forget push notifications to other participants
		this.sendPushToParticipants(transformedMessage).catch(() => {});

		return transformedMessage;
	}

	/**
	 * Get chat room avatar URL
	 * Uses the same logic as frontend: for DIRECT chats use other participant's avatar,
	 * for GROUP/LOAD chats use chat avatar if available
	 */
	private async getChatRoomAvatar(
		chatRoomId: string,
		senderId: string,
	): Promise<string | null> {
		try {
			const chatRoom = await this.prisma.chatRoom.findUnique({
				where: { id: chatRoomId },
				include: {
					participants: {
						include: {
							user: {
								select: {
									id: true,
									profilePhoto: true,
								},
							},
						},
					},
				},
			});

			if (!chatRoom) {
				return null;
			}

			// For DIRECT chats, use the other participant's avatar
			if (
				chatRoom.type === 'DIRECT' &&
				chatRoom.participants.length === 2
			) {
				const otherParticipant = chatRoom.participants.find(
					(p) => p.userId !== senderId,
				);
				if (otherParticipant?.user?.profilePhoto) {
					return otherParticipant.user.profilePhoto;
				}
				return null;
			}

			// For GROUP/LOAD chats, use chat avatar if available
			if (chatRoom.avatar) {
				return chatRoom.avatar;
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Send FCM push notifications to all participants, excluding sender.
	 * Non-blocking; errors ignored.
	 */
	private async sendPushToParticipants(message: any): Promise<void> {
		try {
			// Get all participant ids with mute status and exclude sender and muted users
			const participants = await this.prisma.chatRoomParticipant.findMany(
				{
					where: { chatRoomId: message.chatRoomId },
					select: { userId: true, mute: true },
				},
			);
			const receiverIds = participants
				.filter((p) => p.userId !== message.senderId && !p.mute)
				.map((p) => p.userId);
			if (receiverIds.length === 0) return;

			// Get chat room info to determine notification title
			const chatRoom = await this.prisma.chatRoom.findUnique({
				where: { id: message.chatRoomId },
				select: { type: true, name: true },
			});

			// Get receiver users info (role and driverStatus) for filtering
			const receiverUsers = await this.prisma.user.findMany({
				where: { id: { in: receiverIds } },
				select: { id: true, role: true, driverStatus: true },
			});

			// Get sender info (role) for filtering expired_documents drivers
			const senderUser = await this.prisma.user.findUnique({
				where: { id: message.senderId },
				select: { role: true },
			});

			// Filter receivers based on driver status rules
			const allowedReceiverIds = receiverUsers
				.filter((receiver) => {
					// Block all push notifications for drivers with 'blocked' status
					if (
						receiver.role === UserRole.DRIVER &&
						receiver.driverStatus === 'blocked'
					) {
						return false;
					}

					// Filter push notifications for drivers with 'expired_documents' status
					if (
						receiver.role === UserRole.DRIVER &&
						receiver.driverStatus === 'expired_documents'
					) {
						// Block all non-DIRECT chats
						if (chatRoom?.type !== 'DIRECT') {
							return false;
						}

						// For DIRECT chats, only allow if sender role is in allowed list
						const allowedRolesForExpiredDocuments = [
							UserRole.RECRUITER,
							UserRole.RECRUITER_TL,
							UserRole.ADMINISTRATOR,
							UserRole.EXPEDITE_MANAGER,
						];

						const senderRole = senderUser?.role;
						if (
							!senderRole ||
							!allowedRolesForExpiredDocuments.some(
								(role) => role === senderRole,
							)
						) {
							return false;
						}
					}

					return true;
				})
				.map((receiver) => receiver.id);

			if (allowedReceiverIds.length === 0) return;

			// Fetch device tokens (FCM device tokens, not Expo tokens) only for allowed receivers
			const tokens = await this.prisma.pushToken.findMany({
				where: { userId: { in: allowedReceiverIds } },
				select: { token: true },
			});
			if (tokens.length === 0) return;

			// Determine notification title based on chat type
			let notificationTitle: string;
			if (chatRoom?.type === 'DIRECT') {
				// For DIRECT chats, show sender's name
				const senderName =
					[
						message.sender?.firstName || '',
						message.sender?.lastName || '',
					]
						.join(' ')
						.trim() || 'New message';
				notificationTitle = senderName;
			} else {
				// For GROUP and LOAD chats, show chat room name
				notificationTitle = chatRoom?.name || 'Group Chat';
			}

			const body =
				(message.content && String(message.content).trim()) ||
				(message.fileName
					? `Sent a file: ${message.fileName}`
					: 'New message');

			// Get chat room avatar
			const chatAvatar = await this.getChatRoomAvatar(
				message.chatRoomId,
				message.senderId,
			);

			// Prepare full message data for cache update in mobile app
			// FCM requires all data values to be strings, so we need to serialize objects
			// This allows mobile app to update cache even when app is closed
			const messageData: Record<string, string> = {
				chatRoomId: message.chatRoomId,
				messageId: message.id,
				senderId: message.senderId,
				receiverId: message.receiverId || '',
				content: message.content || '',
				fileUrl: message.fileUrl || '',
				fileName: message.fileName || '',
				fileSize: message.fileSize?.toString() || '0',
				isRead: message.isRead ? 'true' : 'false',
				readBy: JSON.stringify(
					Array.isArray(message.readBy) ? message.readBy : [],
				),
				createdAt: message.createdAt.toISOString(),
				// Serialize sender object (always present)
				sender: JSON.stringify({
					id: message.sender.id,
					firstName: message.sender.firstName || '',
					lastName: message.sender.lastName || '',
					avatar:
						message.sender.avatar ||
						message.sender.profilePhoto ||
						'',
					role: message.sender.role || '',
				}),
				// Serialize receiver object if exists
				receiver: message.receiver
					? JSON.stringify({
							id: message.receiver.id,
							firstName: message.receiver.firstName || '',
							lastName: message.receiver.lastName || '',
							avatar:
								message.receiver.avatar ||
								message.receiver.profilePhoto ||
								'',
							role: message.receiver.role || '',
						})
					: '',
				// Serialize replyData if exists (stored as JSON in DB)
				replyData: message.replyData
					? JSON.stringify(message.replyData)
					: '',
				// Flag to indicate this is a new message (for unreadCount increment)
				isNewMessage: 'true',
				// Include avatar URL for notification display
				...(chatAvatar ? { avatarUrl: chatAvatar } : {}),
			};

			// Extract device tokens
			const allTokens = tokens.map((t) => t.token).filter(Boolean);
			
			// Separate FCM tokens (Android) from Expo Push Tokens (iOS)
			// Expo Push Token starts with "ExponentPushToken[...]"
			const fcmTokens: string[] = [];
			const expoPushTokens: string[] = [];
			
			for (const token of allTokens) {
				if (token.startsWith('ExponentPushToken[')) {
					expoPushTokens.push(token);
				} else {
					fcmTokens.push(token);
				}
			}

			// Send FCM push notifications for Android devices
			if (fcmTokens.length > 0) {
				const fcmOptions = {
					title: notificationTitle,
					body,
					imageUrl: chatAvatar || undefined, // Avatar URL for notification icon (large icon for Android, image for iOS)
					data: messageData,
				};
				await this.fcmPushService.sendToTokens(fcmTokens, fcmOptions);
			}

			// Send Expo Push notifications for iOS devices
			if (expoPushTokens.length > 0) {
				const expoMessages = expoPushTokens.map((token) => ({
					to: token,
					title: notificationTitle,
					body,
					data: messageData,
					sound: 'livechat.wav',
					priority: 'high' as const,
					...(chatAvatar ? { largeIcon: chatAvatar } : {}),
				}));
				await this.expoPushService.send(expoMessages);
			}
		} catch (error) {
			// Log error but don't throw (non-blocking)
			console.error('Failed to send FCM push notifications:', error);
		}
	}

	/**
	 * Get messages for a specific chat room.
	 * - Default mode (no afterCreatedAt): paginated history (most recent messages first, then older ones for infinite scroll)
	 * - Smart sync mode (afterCreatedAt provided): return messages created *after* the given timestamp,
	 *   used by clients to fetch only new messages since the last known message.
	 * Always filters messages to those created after the user joined the chat room.
	 */
	async getChatRoomMessages(
		chatRoomId: string,
		userId: string,
		page: number = 1,
		limit: number = 50,
		afterCreatedAt?: string,
	) {
		// Verify user is participant and get their join date
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

		// Base filter: only messages created after the user joined
		let messageFilter: any = {
			chatRoomId,
			createdAt: {
				gte: participant.joinedAt,
			},
		};

		// If afterCreatedAt is provided, switch to "smart sync" mode:
		// fetch only messages created strictly after the given timestamp.
		if (afterCreatedAt) {
			const afterDate = new Date(afterCreatedAt);
			if (!Number.isNaN(afterDate.getTime())) {
				const minDate =
					afterDate > participant.joinedAt ? afterDate : participant.joinedAt;
				messageFilter = {
					...messageFilter,
					createdAt: {
						gt: minDate,
					},
				};
			}
		}

		let messages;
		let total = 0;
		let pages = 1;
		let hasMore = false;

		if (afterCreatedAt) {
			// Smart sync: fetch only new messages after the given timestamp.
			messages = await this.prisma.message.findMany({
				where: messageFilter,
				orderBy: { createdAt: 'asc' },
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

			total = messages.length;
			pages = 1;
			hasMore = messages.length === limit;
		} else {
			// Default paginated mode (existing behaviour).
			// Get total count first (filtered by join date)
			total = await this.prisma.message.count({
				where: messageFilter,
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

			messages = await this.prisma.message.findMany({
				where: messageFilter,
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

			pages = Math.ceil(total / limit);
			hasMore = Math.max(0, total - page * limit) > 0;
		}

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
				pages,
				hasMore,
			},
		};
	}

	/**
	 * Get files (messages with fileUrl) for a specific chat room with pagination
	 * Only shows files from messages created after the user joined the chat room
	 */
	async getChatRoomFiles(
		chatRoomId: string,
		userId: string,
		page: number = 1,
		limit: number = 10,
	) {
		// Verify user is participant and get their join date
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

		// Filter messages to only show those with files created after the user joined
		const messageFilter = {
			chatRoomId,
			fileUrl: {
				not: null, // Only messages with files
			},
			createdAt: {
				gte: participant.joinedAt, // Only messages created after user joined
			},
		};

		// Get total count of files first (filtered by join date and fileUrl)
		const total = await this.prisma.message.count({
			where: messageFilter,
		});

		// Calculate pagination
		const skip = (page - 1) * limit;

		// Get files with pagination (newest first)
		const messages = await this.prisma.message.findMany({
			where: messageFilter,
			orderBy: { createdAt: 'desc' }, // Newest files first
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

		// Transform messages to match frontend interface
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
				hasMore: page * limit < total, // There are more files if current page * limit < total
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
				readBy: true,
			},
		});

		if (!message || message.senderId === userId) {
			return; // Don't mark own messages
		}

		// Check if user already read this message
		const readBy = (message.readBy as string[]) || [];
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
				readBy: updatedReadBy, // Per-user read status
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
			throw new BadRequestException(
				'Cannot mark your own message as unread',
			);
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
		const readBy = (message.readBy as string[]) || [];
		const userReadIndex = readBy.indexOf(userId);

		if (userReadIndex === -1) {
			return { success: true, messageId, chatRoomId: message.chatRoomId };
		}

		// Remove user from readBy array
		const updatedReadBy = readBy.filter((id) => id !== userId);

		// Apply different logic based on chat type
		if (chatRoom.type === 'DIRECT') {
			// For DIRECT chats: set both isRead to false and remove user from readBy
			await this.prisma.message.update({
				where: { id: messageId },
				data: {
					isRead: false, // Global read status becomes false
					readBy: updatedReadBy, // Remove user from readBy
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
	async markMessagesAsRead(
		chatRoomId: string,
		userId: string,
	): Promise<string[]> {
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
			const readBy = (message.readBy as string[]) || [];
			const alreadyRead = readBy.includes(userId);

			if (!alreadyRead) {
				// Add user to readBy array
				const updatedReadBy = [...readBy, userId];

				await this.prisma.message.update({
					where: { id: message.id },
					data: {
						isRead: true, // Global read status
						readBy: updatedReadBy, // Per-user read status
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

		const chatRoomIds = userChatRooms.map((room) => room.chatRoomId);

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
			const readBy = (message.readBy as string[]) || [];
			const isRead = readBy.includes(userId);
			if (!isRead) {
				unreadCount++;
			}
		}

		return { unreadCount };
	}

	/**
	 * Mark all unread messages as read for specific chat rooms
	 * Only marks messages created after user joined each chat room
	 * This is called when user clicks "Read all" button
	 */
	async markAllMessagesAsReadByChatRooms(
		chatRoomIds: string[],
		userId: string,
	): Promise<{
		success: boolean;
		chatRoomIds: string[];
		messageIds: string[];
		messagesByChatRoom: Record<string, string[]>;
	}> {
		if (chatRoomIds.length === 0) {
			return {
				success: true,
				chatRoomIds: [],
				messageIds: [],
				messagesByChatRoom: {},
			};
		}

		const affectedChatRoomIds = new Set<string>();
		const allMessageIds: string[] = [];
		const messagesByChatRoom: Record<string, string[]> = {};

		// Process each chat room
		for (const chatRoomId of chatRoomIds) {
			try {
				// Get user's join date for this chat room
				const participant = await this.prisma.chatRoomParticipant.findUnique({
					where: {
						chatRoomId_userId: {
							chatRoomId,
							userId,
						},
					},
					select: {
						joinedAt: true,
					},
				});

				if (!participant) {
					// User is not a participant, skip this chat room
					continue;
				}

				// Find all messages in this chat room created after user joined
				// We'll filter by readBy in JavaScript since Prisma doesn't support JSON array contains easily
				const allMessages = await this.prisma.message.findMany({
					where: {
						chatRoomId,
						createdAt: {
							gte: participant.joinedAt,
						},
					},
					select: {
						id: true,
						readBy: true,
						isRead: true,
					},
				});

				// Filter messages where user is not in readBy array
				const unreadMessages = allMessages.filter((message) => {
					const readBy = (message.readBy as string[]) || [];
					return !readBy.includes(userId);
				});

				// Process each message
				for (const message of unreadMessages) {
					const readBy = (message.readBy as string[]) || [];
					const alreadyRead = readBy.includes(userId);

					if (!alreadyRead) {
						// Add user to readBy array
						const updatedReadBy = [...readBy, userId];

						// Update message: add userId to readBy
						// If isRead is false, set it to true; if it's already true, keep it true
						await this.prisma.message.update({
							where: { id: message.id },
							data: {
								readBy: updatedReadBy,
								isRead: true, // Set to true when user reads it
							},
						});

						allMessageIds.push(message.id);
						affectedChatRoomIds.add(chatRoomId);

						// Group message IDs by chat room
						if (!messagesByChatRoom[chatRoomId]) {
							messagesByChatRoom[chatRoomId] = [];
						}
						messagesByChatRoom[chatRoomId].push(message.id);
					}
				}
			} catch (error) {
				// Continue processing other chat rooms if one fails
				console.error(
					`Failed to mark messages as read for chat room ${chatRoomId}:`,
					error,
				);
				continue;
			}
		}

		return {
			success: true,
			chatRoomIds: Array.from(affectedChatRoomIds),
			messageIds: allMessageIds,
			messagesByChatRoom,
		};
	}

	/**
	 * Delete a message (only by sender)
	 */
	async deleteMessage(
		messageId: string,
		userId: string,
		userRole?: string,
		chatGateway?: any,
	) {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			include: {
				chatRoom: {
					include: {
						participants: {
							select: { userId: true },
						},
					},
				},
			},
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
			const participantIds = message.chatRoom.participants.map(
				(p) => p.userId,
			);

			// Emit to all participants in the chat room
			chatGateway.server
				.to(`chat_${message.chatRoomId}`)
				.emit('messageDeleted', {
					messageId,
					chatRoomId: message.chatRoomId,
					deletedBy: userId,
					deletedByRole: userRole,
				});

			// Also emit to individual users who might not be in the room
			participantIds.forEach((_participantId) => {
				chatGateway.server.emit('messageDeleted', {
					messageId,
					chatRoomId: message.chatRoomId,
					deletedBy: userId,
					deletedByRole: userRole,
				});
			});
		}

		return {
			success: true,
			messageId,
			chatRoomId: message.chatRoomId,
			deletedBy: userId,
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
