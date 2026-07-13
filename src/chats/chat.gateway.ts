import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	MessageBody,
	ConnectedSocket,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { JWT_VERIFY_ALLOW_EXPIRED_OPTIONS } from '../auth/constants/jwt-verify-options';
import { MessagesService } from './messages.service';
import { ChatRoomsService } from './chat-rooms.service';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';
import { PrismaService } from '../prisma/prisma.service';
import { userDeviceSocketRoom } from '../common/user-device-socket.util';

interface AuthenticatedSocket extends Socket {
	userId?: string;
	userRole?: string;
	data: {
		typingTimeout?: NodeJS.Timeout | null;
	};
}

@WebSocketGateway({
	cors: {
		origin: process.env.FRONTEND_URL || 'http://localhost:3000',
		credentials: true,
	},
	// namespace: '/chat',  // Removed for better compatibility with hosting platforms
})
export class ChatGateway
	implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
	@WebSocketServer()
	server: Server;

	// Store user socket connections for real-time messaging
	private userSockets = new Map<string, string>();

	// Store offline timeouts for users
	private offlineTimeouts = new Map<string, NodeJS.Timeout>();

	constructor(
		private messagesService: MessagesService,
		private chatRoomsService: ChatRoomsService,
		private jwtService: JwtService,
		private notificationsWebSocketService: NotificationsWebSocketService,
		private prisma: PrismaService,
	) {}

	/**
	 * Initialize WebSocket server after module initialization
	 */
	afterInit(server: Server) {
		this.server = server;
		// Initialize notifications WebSocket service with the server
		this.notificationsWebSocketService.setServer(server);
		console.log('✅ WebSocket server initialized');
	}

	/**
	 * Clean up all timeouts when the service is destroyed
	 */
	onModuleDestroy() {
		// Clear all offline timeouts
		for (const timeout of this.offlineTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.offlineTimeouts.clear();
	}

	/**
	 * Handle client connection
	 * Authenticate user and join them to their chat rooms
	 */
	async handleConnection(client: AuthenticatedSocket) {
		try {
			// Authenticate user manually since WsJwtGuard doesn't work with handleConnection
			const token = this.extractTokenFromHeader(client);

			if (!token) {
				// Allow public connections without token (for tracking page)
				// They can only listen to public events like userLocationUpdate
				// Send confirmation to public client
				client.emit('connected', {
					public: true,
					message: 'Public connection established',
				});
				// Don't disconnect - allow public connection to stay connected
				return;
			}

			// Verify JWT token
			const payload = await this.jwtService.verifyAsync(
				token,
				JWT_VERIFY_ALLOW_EXPIRED_OPTIONS,
			);
			client.userId = payload.sub;
			client.userRole = payload.role;

			const userId = client.userId;
			const userRole = client.userRole;

			if (!userId) {
				console.log(
					'❌ WebSocket connection: No userId after auth, disconnecting',
				);
				client.disconnect();
				return;
			}

			// Store socket connection for this user
			this.userSockets.set(userId, client.id);

			// Clear any existing offline timeout for this user (user reconnected)
			const existingTimeout = this.offlineTimeouts.get(userId);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
				this.offlineTimeouts.delete(userId);
			}

			// Join user to notifications room for real-time notifications
			void client.join(`user_${userId}`);

			const deviceId = this.extractDeviceIdFromHandshake(client);
			if (deviceId) {
				const deviceRoom = userDeviceSocketRoom(userId, deviceId);
				if (deviceRoom) {
					void client.join(deviceRoom);
				}
			}

			// Join user to all their chat rooms
			const chatRooms =
				await this.chatRoomsService.getUserChatRooms(userId);

			for (const room of chatRooms) {
				void client.join(`chat_${room.id}`);

				// Notify other participants that user is online (for all chat types)
				// Send one event to the entire room instead of one per participant
				void this.server.to(`chat_${room.id}`).emit('userOnline', {
					userId: userId,
					chatRoomId: room.id,
					isOnline: true,
				});

				// Notify the connecting user about who is already online
				const otherParticipants = room.participants.filter(
					(p) => p.userId !== userId,
				);
				for (const participant of otherParticipants) {
					if (this.userSockets.has(participant.userId)) {
						void client.emit('userOnline', {
							userId: participant.userId,
							chatRoomId: room.id,
							isOnline: true,
						});
					}
				}
			}

			// Join user to role-based rooms for broadcast messages
			void client.join(`role_${userRole}`);

			// Send connection confirmation
			client.emit('connected', {
				userId,
				userRole,
				chatRooms: chatRooms.length,
			});

			console.log('✅ WebSocket connected:', {
				userId,
				userRole,
				chatRoomsCount: chatRooms.length,
				totalOnlineUsers: this.userSockets.size,
			});
		} catch (error) {
			// Only disconnect if it's not a public connection (no token)
			const token = this.extractTokenFromHeader(client);
			if (token) {
				console.error(
					'❌ WebSocket connection error (with token):',
					error,
				);
				client.disconnect();
			} else {
				// Public connection error - log but don't disconnect
				console.log(
					'ℹ️ WebSocket connection error (public, no token):',
					error?.message || error,
				);
			}
		}
	}

	/**
	 * Handle client disconnection
	 * Clean up user socket connections with delay
	 */
	handleDisconnect(client: AuthenticatedSocket) {
		const userId = client.userId;
		if (!userId) {
			return;
		}

		const disconnectedSocketId = client.id;

		// Clear any existing offline timeout for this user
		const existingTimeout = this.offlineTimeouts.get(userId);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		// Set a 5-second timeout before marking user as offline
		const offlineTimeout = setTimeout(() => {
			// User may have reconnected on a new socket — do not mark offline for a stale disconnect
			if (this.userSockets.get(userId) !== disconnectedSocketId) {
				this.offlineTimeouts.delete(userId);
				return;
			}

			this.userSockets.delete(userId);
			this.offlineTimeouts.delete(userId);

			// Notify other participants that user is offline (for all chat types)
			this.chatRoomsService
				.getUserChatRooms(userId)
				.then((chatRooms) => {
					for (const room of chatRooms) {
						void this.server
							.to(`chat_${room.id}`)
							.emit('userOnline', {
								userId: userId,
								chatRoomId: room.id,
								isOnline: false,
							});
					}
				})
				.catch((error) => {
					console.error(
						'Error notifying about user offline status:',
						error,
					);
				});
		}, 5000);

		this.offlineTimeouts.set(userId, offlineTimeout);
	}

	/**
	 * Handle joining a specific chat room
	 * Used when user opens a chat conversation.
	 * Mark-as-read is handled separately via markChatRoomAsRead.
	 */
	@SubscribeMessage('joinChatRoom')
	@UseGuards(WsJwtGuard)
	async handleJoinChatRoom(
		@MessageBody() data: { chatRoomId: string },
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId } = data;
		const userId = client.userId;

		if (!userId) {
			console.log('❌ WebSocket joinChatRoom: Unauthorized - no userId');
			return { error: 'Unauthorized' };
		}

		try {
			await this.chatRoomsService.assertChatRoomAccess(chatRoomId, userId);

			void client.join(`chat_${chatRoomId}`);

			client.emit('joinedChatRoom', { chatRoomId });

			void client
				.to(`chat_${chatRoomId}`)
				.emit('userJoined', { userId, chatRoomId });
		} catch (error) {
			console.error('❌ WebSocket joinChatRoom: Error', {
				userId,
				chatRoomId,
				error: error.message,
			});
			client.emit('error', { message: 'Failed to join chat room' });
		}
	}

	/**
	 * Handle leaving a chat room
	 * Used when user closes a chat conversation
	 */
	@SubscribeMessage('leaveChatRoom')
	handleLeaveChatRoom(
		@MessageBody() data: { chatRoomId: string },
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		void client.leave(`chat_${chatRoomId}`);
		client.emit('leftChatRoom', { chatRoomId });

		// Notify other participants
		void client
			.to(`chat_${chatRoomId}`)
			.emit('userLeft', { userId, chatRoomId });
	}

	/**
	 * Handle typing indicators
	 * Shows when user is typing a message with automatic timeout
	 */
	@SubscribeMessage('typing')
	async handleTyping(
		@MessageBody() data: { chatRoomId: string; isTyping: boolean },
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId, isTyping } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		// Verify user has access to this chat room and get user data
		let userFirstName = 'Someone';
		try {
			const chatRoom = await this.chatRoomsService.getChatRoomOutboundContext(
				chatRoomId,
				userId,
			);
			// Get user data from participants
			const userParticipant = chatRoom.participants.find(
				(p) => p.userId === userId,
			);
			if (userParticipant?.user?.firstName) {
				userFirstName = userParticipant.user.firstName;
			}
		} catch {
			client.emit('error', {
				message: 'Access denied to this chat room',
			});
			return;
		}

		// Broadcast typing indicator to other participants with user data
		void client.to(`chat_${chatRoomId}`).emit('userTyping', {
			userId,
			chatRoomId,
			isTyping,
			firstName: userFirstName,
		});

		// If user started typing, set a timeout to automatically stop the indicator
		if (isTyping) {
			// Clear any existing timeout for this user
			if (client.data.typingTimeout) {
				clearTimeout(client.data.typingTimeout);
			}

			// Set new timeout to stop typing indicator after 4 seconds
			client.data.typingTimeout = setTimeout(() => {
				void client.to(`chat_${chatRoomId}`).emit('userTyping', {
					userId,
					chatRoomId,
					isTyping: false,
					firstName: userFirstName,
				});
			}, 4000);
		} else {
			// User stopped typing, clear the timeout
			if (client.data.typingTimeout) {
				clearTimeout(client.data.typingTimeout);
				client.data.typingTimeout = null;
			}
		}
	}

	/**
	 * Handle sending messages through WebSocket
	 * This provides real-time message sending without HTTP requests
	 */
	@SubscribeMessage('sendMessage')
	@UseGuards(WsJwtGuard)
	async handleSendMessage(
		@MessageBody()
		data: {
			chatRoomId: string;
			content: string;
			clientMessageId?: string;
			fileUrl?: string;
			fileName?: string;
			fileSize?: number;
			attachments?: Array<{
				fileUrl: string;
				fileName: string;
				fileSize?: number;
			}>;
			replyData?: {
				avatar?: string;
				time: string;
				content: string;
				senderName: string;
			};
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const {
			chatRoomId,
			content,
			clientMessageId,
			fileUrl,
			fileName,
			fileSize,
			replyData,
			attachments,
		} = data;
		const userId = client.userId;

		if (!userId) {
			console.log('❌ WebSocket sendMessage: Unauthorized - no userId');
			return { error: 'Unauthorized' };
		}

		try {
			// Ensure user is in the chat room for WebSocket
			void client.join(`chat_${chatRoomId}`);

			// Verify user has access to this chat room (no message history load)
			const chatRoom = await this.chatRoomsService.getChatRoomOutboundContext(
				chatRoomId,
				userId,
			);

			// For DIRECT and OFFER chats: unhide chat for all participants if hidden
			if (chatRoom.type === 'DIRECT' || chatRoom.type === 'OFFER') {
				await Promise.all(
					chatRoom.participants.map(async (participant) => {
						const wasUnhidden =
							await this.chatRoomsService.unhideChatRoom(
								chatRoomId,
								participant.userId,
							);
						if (wasUnhidden) {
							this.notifyChatRoomRestored(
								chatRoomId,
								participant.userId,
							);
						}
					}),
				);
			}

			const participantUserIds = chatRoom.participants.map(
				(participant) => participant.userId,
			);

			// Create message using the service
			const message = await this.messagesService.sendMessage(
				{
					chatRoomId,
					content,
					clientMessageId,
					fileUrl,
					fileName,
					fileSize,
					replyData,
					attachments,
				},
				userId,
				{ participantUserIds },
			);

			// Ack sender immediately after persist; broadcast can follow asynchronously.
			client.emit('messageSent', {
				messageId: message.id,
				chatRoomId,
				clientMessageId: message.clientMessageId ?? undefined,
				message,
			});

			void this.broadcastMessage(chatRoomId, message, participantUserIds);

			console.log('✅ Message sent:', {
				userId,
				chatRoomId,
				messageId: message.id,
				contentLength: content.length,
			});
		} catch (error) {
			console.error('❌ WebSocket sendMessage: Error', {
				userId,
				chatRoomId,
				error: error.message,
			});
			client.emit('error', {
				message: 'Failed to send message',
				details: (error as Error).message,
			});
		}
	}

	@SubscribeMessage('editMessage')
	@UseGuards(WsJwtGuard)
	async handleEditMessage(
		@MessageBody()
		data: {
			messageId: string;
			content: string;
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const userId = client.userId;
		const userRole = client.userRole;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		try {
			await this.messagesService.updateMessage(
				data.messageId,
				data.content,
				userId,
				userRole,
				this,
			);
		} catch (error) {
			console.error('❌ WebSocket editMessage: Error', {
				userId,
				messageId: data.messageId,
				error: (error as Error).message,
			});
			client.emit('error', {
				message: 'Failed to edit message',
				details: (error as Error).message,
			});
		}
	}

	/**
	 * Handle message delivery confirmation
	 * Used to track message delivery status
	 */
	@SubscribeMessage('messageDelivered')
	handleMessageDelivered(
		@MessageBody() data: { messageId: string; chatRoomId: string },
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { messageId, chatRoomId } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		console.log('handleMessageDelivered chatRoomId =', chatRoomId);

		// Mark message as delivered (you can extend Message model for this)
		// For now, we'll just acknowledge receipt
		client.emit('messageDeliveredConfirmed', { messageId });
	}

	/**
	 * Handle message read confirmation
	 * Used to track message read status
	 */
	@SubscribeMessage('messageRead')
	async handleMessageRead(
		@MessageBody() data: { messageId: string; chatRoomId: string },
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { messageId } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		// Mark specific message as read
		await this.messagesService.markMessageAsRead(messageId, userId);

		const message = await this.messagesService.getMessageById(messageId);
		if (message) {
			const unreadCount =
				await this.messagesService.getParticipantUnreadCount(
					message.chatRoomId,
					userId,
				);
			this.emitChatUnreadCountUpdated(
				userId,
				message.chatRoomId,
				unreadCount,
			);

			if (message.senderId !== userId) {
				// Notify everyone in the chat room (senders see read receipts in real time)
				void this.server.to(`chat_${message.chatRoomId}`).emit('messageRead', {
					messageId,
					readBy: userId,
					chatRoomId: message.chatRoomId,
				});
			}
		}
	}

	/**
	 * Mark all messages in a chat room as read
	 * This is called when user explicitly opens a chat to mark all as read
	 */
	@SubscribeMessage('markChatRoomAsRead')
	async handleMarkChatRoomAsRead(
		@MessageBody() data: { chatRoomId: string },
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		// Mark all messages as read
		const updatedMessageIds = await this.messagesService.markMessagesAsRead(
			chatRoomId,
			userId,
		);

		const readSnapshots =
			await this.messagesService.getMessagesReadBySnapshot(
				updatedMessageIds,
			);
		const payload = {
			chatRoomId,
			messageIds: updatedMessageIds,
			userId,
			messages: readSnapshots,
		};

		// Always notify the requesting client so unread UI can sync even when nothing
		// changed in DB (already in readBy) — otherwise the frontend keeps a stale count.
		client.emit('messagesMarkedAsRead', payload);
		this.emitChatUnreadCountUpdated(userId, chatRoomId, 0);

		// Other participants need full readBy snapshots for the "Read by" list
		if (updatedMessageIds.length > 0) {
			client
				.to(`chat_${chatRoomId}`)
				.emit('messagesMarkedAsRead', payload);
		}
	}

	/**
	 * Push authoritative per-room unread count (new clients).
	 * Old mobile ignores this event and keeps local +/- logic.
	 */
	emitChatUnreadCountUpdated(
		userId: string,
		chatRoomId: string,
		unreadCount: number,
	): void {
		if (!this.server) {
			return;
		}
		void this.server
			.to(`user_${userId}`)
			.emit('chatUnreadCountUpdated', { chatRoomId, unreadCount });
	}

	private async broadcastChatUnreadCountsAfterNewMessage(
		chatRoomId: string,
		senderId: string,
	): Promise<void> {
		const participants = await this.prisma.chatRoomParticipant.findMany({
			where: {
				chatRoomId,
				userId: { not: senderId },
			},
			select: { userId: true, unreadCount: true },
		});

		for (const participant of participants) {
			this.emitChatUnreadCountUpdated(
				participant.userId,
				chatRoomId,
				participant.unreadCount,
			);
		}
	}

	/**
	 * Broadcast message to all participants in a chat room
	 * Called by MessagesService after saving message to database
	 */
	async broadcastMessage(
		chatRoomId: string,
		message: {
			id: string;
			content: string;
			senderId: string;
			receiverId?: string | null;
			fileUrl?: string | null;
			fileName?: string | null;
			fileSize?: number | null;
			isRead: boolean;
			readBy?: any;
			createdAt: Date;
			sender: {
				id: string;
				firstName: string;
				lastName: string;
				avatar?: string | null;
				role: string;
				externalId?: string | null;
				phone?: string | null;
			};
			receiver?: {
				id: string;
				firstName: string;
				lastName: string;
				avatar?: string | null;
				role: string;
			} | null;
		},
		participantUserIds?: string[],
	) {
		console.log(`📤 Broadcasting newMessage to room chat_${chatRoomId}:`, {
			chatRoomId,
			messageId: message.id,
			senderId: message.senderId,
			content: message.content.substring(0, 50) + '...',
		});

		const participants =
			participantUserIds !== undefined
				? participantUserIds.map((userId) => ({ userId }))
				: await this.prisma.chatRoomParticipant.findMany({
						where: { chatRoomId },
						select: { userId: true },
					});

		if (participants.length === 0) {
			console.error(`Chat room ${chatRoomId} has no participants`);
			return;
		}

		// Send to all participants' personal notification rooms
		// This ensures users receive messages even when not in the specific chat
		const messageData = {
			chatRoomId,
			message,
		};

		// Send to all participants' notification rooms (including sender for confirmation)
		for (const participant of participants) {
			void this.server
				.to(`user_${participant.userId}`)
				.emit('newMessage', messageData);
		}

		void this.broadcastChatUnreadCountsAfterNewMessage(
			chatRoomId,
			message.senderId,
		);

		// Also emit to general chat updates for chat list updates
		void this.server.emit('chatUpdated', { chatRoomId });
	}

	broadcastMessageUpdated(
		chatRoomId: string,
		message: unknown,
		participantUserIds: string[],
	) {
		const payload = { chatRoomId, message };

		this.server.to(`chat_${chatRoomId}`).emit('messageUpdated', payload);

		for (const participantId of participantUserIds) {
			this.server
				.to(`user_${participantId}`)
				.emit('messageUpdated', payload);
		}

		void this.server.emit('chatUpdated', { chatRoomId });
	}

	/**
	 * Broadcast updated reactions for a message to all chat participants.
	 */
	async broadcastMessageReactions(
		chatRoomId: string,
		messageId: string,
		reactions: unknown[],
		meta?: {
			messageSenderId: string;
			actorUserId: string;
			actorFirstName: string;
			actorLastName: string;
			emoji?: string;
			action: 'set' | 'remove';
		},
	) {
		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: chatRoomId },
			include: {
				participants: true,
			},
		});

		if (!chatRoom) {
			return;
		}

		const payload = {
			chatRoomId,
			messageId,
			reactions,
			...(meta ?? {}),
		};

		const targetRooms = [
			`chat_${chatRoomId}`,
			...chatRoom.participants.map(
				(participant) => `user_${participant.userId}`,
			),
		];

		void this.server
			.to(targetRooms)
			.emit('messageReactionsUpdated', payload);
	}

	/**
	 * Send notification to specific user
	 * Used for offline notifications
	 */
	sendUserNotification(
		userId: string,
		notification: {
			title: string;
			message: string;
			type: string;
			chatRoomId?: string;
		},
	) {
		const socketId = this.userSockets.get(userId);
		if (socketId) {
			void this.server.to(socketId).emit('notification', notification);
		}
	}

	/**
	 * Broadcast to all users with specific role
	 * Useful for system announcements
	 */
	broadcastToRole(
		role: string,
		message: {
			title: string;
			content: string;
			type: string;
		},
	) {
		void this.server.to(`role_${role}`).emit('roleBroadcast', {
			role,
			message,
		});
	}

	/**
	 * Handle creating a new chat room through WebSocket
	 * This provides real-time chat room creation
	 */
	@SubscribeMessage('createChatRoom')
	async handleCreateChatRoom(
		@MessageBody()
		data: {
			name?: string;
			type: string;
			loadId?: string;
			participantIds: string[];
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { name, type, loadId, participantIds } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		try {
			// Create chat room using the service
			const { chatRoom, created } = await this.chatRoomsService.createChatRoom(
				{
					name,
					type,
					loadId,
					participantIds,
				},
				userId,
			);

			// Join creator to the chat room
			void client.join(`chat_${chatRoom.id}`);

			if (created) {
				for (const participantId of participantIds) {
					const participantSocketId = this.userSockets.get(participantId);
					if (participantSocketId) {
						void this.server
							.to(participantSocketId)
							.emit('chatRoomCreated', chatRoom);
					}
				}
			}

			client.emit('chatRoomCreated', chatRoom);

			console.log(
				`Chat room created via WebSocket: ${chatRoom.id} by user ${userId}`,
			);
		} catch (error) {
			console.error('Error creating chat room via WebSocket:', error);
			client.emit('error', {
				message: 'Failed to create chat room',
				details: (error as Error).message,
			});
		}
	}

	/**
	 * Notify all participants about a new chat room created via HTTP API
	 * This method is called from the HTTP controller to send WebSocket notifications
	 */
	notifyChatRoomCreated(chatRoom: any, participantIds: string[]) {
		// Notify all participants about the new chat room.
		// Prefer emitting to the per-user room `user_<id>` (client always joins it on connect),
		// and keep socketId-based emit as a fallback.
		for (const participantId of participantIds) {
			// Reliable path: user room
			void this.server
				.to(`user_${participantId}`)
				.emit('chatRoomCreated', chatRoom);

			// Fallback path: direct socket id (in case room join behavior changes)
			const participantSocketId = this.userSockets.get(participantId);
			if (participantSocketId) {
				void this.server
					.to(participantSocketId)
					.emit('chatRoomCreated', chatRoom);
			}
		}

		console.log(
			`Chat room created via HTTP API: ${chatRoom.id}, notified ${participantIds.length} participants`,
		);
	}

	/**
	 * Handle updating chat room through WebSocket
	 * This provides real-time chat room updates
	 */
	@SubscribeMessage('updateChatRoom')
	async handleUpdateChatRoom(
		@MessageBody()
		data: {
			chatRoomId: string;
			updates: { name?: string; isArchived?: boolean };
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId, updates } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		try {
			// Update chat room using the service
			const updatedChatRoom = await this.chatRoomsService.updateChatRoom(
				chatRoomId,
				updates,
				userId,
			);

			// Broadcast update to all participants
			void this.server.to(`chat_${chatRoomId}`).emit('chatRoomUpdated', {
				chatRoomId,
				updatedChatRoom,
				updatedBy: userId,
				updatedAt: new Date().toISOString(),
			});

			// Send confirmation back to updater
			client.emit('chatRoomUpdated', { chatRoomId, updatedChatRoom });

			console.log(
				`Chat room updated via WebSocket: ${chatRoomId} by user ${userId}`,
			);
		} catch (error) {
			console.error('Error updating chat room via WebSocket:', error);
			client.emit('error', {
				message: 'Failed to update chat room',
				details: (error as Error).message,
			});
		}
	}

	/**
	 * Handle adding participants to chat room through WebSocket
	 * This provides real-time participant management
	 */
	@SubscribeMessage('addParticipants')
	async handleAddParticipants(
		@MessageBody()
		data: {
			chatRoomId: string;
			participantIds?: string[];
			participants?: Array<{ id: string; role: string }>;
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId, participantIds = [], participants } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		const participantRefs =
			participants?.length
				? participants
				: participantIds.map((id) => ({ id }));

		try {
			// Add participants using the service (LOAD + DRIVER forks a new chat)
			const { newParticipants, forkedChatRooms } =
				await this.chatRoomsService.addParticipants(
					chatRoomId,
					participantIds,
					userId,
					participantRefs,
				);

			if (forkedChatRooms.length > 0) {
				for (const forked of forkedChatRooms) {
					const forkedParticipantIds = (forked.participants || []).map(
						(p: { userId: string }) => p.userId,
					);
					this.notifyChatRoomCreated(forked, forkedParticipantIds);
					void client.join(`chat_${forked.id}`);
				}

				client.emit('loadChatForked', {
					sourceChatRoomId: chatRoomId,
					chatRooms: forkedChatRooms,
				});
			}

			if (newParticipants.length > 0) {
				const addedUserIds = newParticipants.map(
					(participant) => participant.userId,
				);

				// Notify all current participants about new members
				void this.server
					.to(`chat_${chatRoomId}`)
					.emit('participantsAdded', {
						chatRoomId,
						newParticipants,
						addedBy: userId,
					});

				// Notify new participants about the chat room
				addedUserIds.forEach((participantId) => {
					void this.server
						.to(`user_${participantId}`)
						.emit('addedToChatRoom', {
							chatRoomId,
							addedBy: userId,
						});

					const participantSocketId = this.userSockets.get(participantId);
					if (participantSocketId) {
						void this.server
							.to(participantSocketId)
							.emit('addedToChatRoom', {
								chatRoomId,
								addedBy: userId,
							});
					}
				});

				// Send confirmation back to adder
				client.emit('participantsAdded', { chatRoomId, newParticipants });
			}

			console.log(
				`Participants added via WebSocket to room ${chatRoomId} by user ${userId}` +
					(forkedChatRooms.length
						? ` (forked ${forkedChatRooms.length} LOAD chat(s))`
						: ''),
			);
		} catch (error) {
			console.error('Error adding participants via WebSocket:', error);
			client.emit('error', {
				message: 'Failed to add participants',
				details: (error as Error).message,
			});
		}
	}

	/**
	 * Handle removing participants from chat room through WebSocket
	 * This provides real-time participant management
	 */
	@SubscribeMessage('removeParticipant')
	async handleRemoveParticipant(
		@MessageBody()
		data: {
			chatRoomId: string;
			participantId: string;
			participantRole?: string;
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId, participantId, participantRole } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		try {
			// Remove participant using the service
			const result = await this.chatRoomsService.removeParticipant(
				chatRoomId,
				participantId,
				userId,
				participantRole,
			);

			const removedUserId = result.removedUserId;

			// Notify all current participants about the removal
			void this.server
				.to(`chat_${chatRoomId}`)
				.emit('participantRemoved', {
					chatRoomId,
					removedUserId,
					removedBy: userId,
				});

			// Notify the removed participant
			const removedUserSocketId = this.userSockets.get(removedUserId);
			if (removedUserSocketId) {
				void this.server
					.to(removedUserSocketId)
					.emit('removedFromChatRoom', {
						chatRoomId,
						removedBy: userId,
					});
			}

			// Send confirmation back to remover
			client.emit('participantRemoved', {
				chatRoomId,
				removedUserId,
				removedBy: userId,
				result,
			});
		} catch (error) {
			console.error('Error removing participant via WebSocket:', error);
			client.emit('error', {
				message: 'Failed to remove participant',
				details: (error as Error).message,
			});
		}
	}

	/**
	 * Get online users count
	 * Useful for monitoring system usage
	 */
	getOnlineUsersCount(): number {
		return this.userSockets.size;
	}

	/**
	 * Check if specific user is online
	 */
	isUserOnline(userId: string): boolean {
		return this.userSockets.has(userId);
	}

	/**
	 * Notify users about chat room deletion
	 * Called from REST API controller after deletion/hiding
	 */
	notifyChatRoomDeleted(
		chatRoomId: string,
		userId: string,
		result: { deleted: boolean; hidden?: boolean; left?: boolean },
	) {
		if (result.deleted) {
			// Chat was fully deleted - notify all participants
			void this.server.to(`chat_${chatRoomId}`).emit('chatRoomDeleted', {
				chatRoomId,
				deletedBy: userId,
			});
		} else if (result.hidden) {
			// Chat was hidden for one user - only notify that user
			const userSocketId = this.userSockets.get(userId);
			if (userSocketId) {
				void this.server.to(userSocketId).emit('chatRoomHidden', {
					chatRoomId,
				});
			}
		} else if (result.left) {
			// User left group chat - notify all participants
			void this.server
				.to(`chat_${chatRoomId}`)
				.emit('participantRemoved', {
					chatRoomId,
					removedUserId: userId,
					removedBy: userId,
				});
		}
	}

	/**
	 * Notify about chat room restoration
	 * Called when a message is sent to a hidden DIRECT chat
	 */
	notifyChatRoomRestored(chatRoomId: string, userId: string) {
		const userSocketId = this.userSockets.get(userId);
		if (userSocketId) {
			void this.server.to(userSocketId).emit('chatRoomRestored', {
				chatRoomId,
			});
		}
	}

	/**
	 * Extract JWT token from WebSocket handshake
	 */
	private extractTokenFromHeader(client: Socket): string | undefined {
		const auth =
			(client.handshake.auth?.token as string) ||
			(client.handshake.headers?.authorization as string) ||
			(client.handshake.query?.token as string);

		if (!auth) {
			return undefined;
		}

		// Handle both "Bearer token" and direct token formats
		if (auth.startsWith('Bearer ')) {
			return auth.substring(7);
		}

		return auth;
	}

	private extractDeviceIdFromHandshake(client: Socket): string | undefined {
		const raw =
			(client.handshake.auth?.deviceId as string | undefined) ||
			(client.handshake.query?.deviceId as string | undefined);
		const trimmed = raw?.trim();
		return trimmed || undefined;
	}
}
