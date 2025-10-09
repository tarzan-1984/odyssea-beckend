import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	MessageBody,
	ConnectedSocket,
	OnGatewayConnection,
	OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { MessagesService } from './messages.service';
import { ChatRoomsService } from './chat-rooms.service';

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
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
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
	) {}

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
				console.log(
					'❌ WebSocket connection: No token provided, disconnecting',
				);
				client.disconnect();
				return;
			}

			// Verify JWT token
			const payload = await this.jwtService.verifyAsync(token);
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

			// Join user to all their chat rooms
			const chatRooms =
				await this.chatRoomsService.getUserChatRooms(userId);

			for (const room of chatRooms) {
				void client.join(`chat_${room.id}`);

				// Notify other participants that user is online (for all chat types)
				const otherParticipants = room.participants.filter(
					(p) => p.userId !== userId,
				);
				for (const participant of otherParticipants) {
					void client.to(`chat_${room.id}`).emit('userOnline', {
						userId: userId,
						chatRoomId: room.id,
						isOnline: true,
					});
				}

				// Notify the connecting user about who is already online
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
			console.error('❌ WebSocket connection error:', error);
			client.disconnect();
		}
	}

	/**
	 * Handle client disconnection
	 * Clean up user socket connections with delay
	 */
	handleDisconnect(client: AuthenticatedSocket) {
		const userId = client.userId;
		if (userId) {
			// Clear any existing offline timeout for this user
			const existingTimeout = this.offlineTimeouts.get(userId);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
			}

			// Set a 5-second timeout before marking user as offline
			const offlineTimeout = setTimeout(() => {
				this.userSockets.delete(userId);
				this.offlineTimeouts.delete(userId);

				// Notify other participants that user is offline (for all chat types)
				this.chatRoomsService
					.getUserChatRooms(userId)
					.then((chatRooms) => {
						for (const room of chatRooms) {
							const otherParticipants = room.participants.filter(
								(p) => p.userId !== userId,
							);
							for (const participant of otherParticipants) {
								void client
									.to(`chat_${room.id}`)
									.emit('userOnline', {
										userId: userId,
										chatRoomId: room.id,
										isOnline: false,
									});
							}
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
	}

	/**
	 * Handle joining a specific chat room
	 * Used when user opens a chat conversation
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
			// Verify user has access to this chat room
			await this.chatRoomsService.getChatRoom(chatRoomId, userId);

			// Join the specific chat room
			void client.join(`chat_${chatRoomId}`);

			// Mark messages as read and get the IDs of updated messages
			const updatedMessageIds =
				await this.messagesService.markMessagesAsRead(
					chatRoomId,
					userId,
				);

			client.emit('joinedChatRoom', { chatRoomId });

			// If any messages were marked as read, notify all participants in the chat
			if (updatedMessageIds.length > 0) {
				// Emit to the client who joined
				client.emit('messagesMarkedAsRead', {
					chatRoomId,
					messageIds: updatedMessageIds,
					userId,
				});
				// Also emit to all other participants in the room (for read receipts)
				client.to(`chat_${chatRoomId}`).emit('messagesMarkedAsRead', {
					chatRoomId,
					messageIds: updatedMessageIds,
					userId,
				});
			}

			// Notify other participants that user is typing
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
			const chatRoom = await this.chatRoomsService.getChatRoom(
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
			fileUrl?: string;
			fileName?: string;
			fileSize?: number;
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId, content, fileUrl, fileName, fileSize } = data;
		const userId = client.userId;

		if (!userId) {
			console.log('❌ WebSocket sendMessage: Unauthorized - no userId');
			return { error: 'Unauthorized' };
		}

		try {
			// Verify user has access to this chat room
			await this.chatRoomsService.getChatRoom(chatRoomId, userId);

			// Create message using the service
			const message = await this.messagesService.sendMessage(
				{
					chatRoomId,
					content,
					fileUrl,
					fileName,
					fileSize,
				},
				userId,
			);

			// Broadcast message to all participants in the chat room
			this.broadcastMessage(chatRoomId, message);

			// Send confirmation back to sender
			client.emit('messageSent', { messageId: message.id, chatRoomId });

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
		const { messageId, chatRoomId } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		// Mark specific message as read
		await this.messagesService.markMessageAsRead(messageId, userId);

		// Notify sender that message was read
		const message = await this.messagesService.getMessageById(messageId);
		if (message && message.senderId !== userId) {
			const senderSocketId = this.userSockets.get(message.senderId);
			if (senderSocketId) {
				void this.server
					.to(senderSocketId)
					.emit('messageRead', { messageId, readBy: userId });
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

		// Notify all participants (including sender for UI update, and other participants for read receipts)
		if (updatedMessageIds.length > 0) {
			// Emit to the client who requested
			client.emit('messagesMarkedAsRead', {
				chatRoomId,
				messageIds: updatedMessageIds,
				userId,
			});
			// Also emit to all other participants
			client.to(`chat_${chatRoomId}`).emit('messagesMarkedAsRead', {
				chatRoomId,
				messageIds: updatedMessageIds,
				userId,
			});
		}
	}

	/**
	 * Broadcast message to all participants in a chat room
	 * Called by MessagesService after saving message to database
	 */
	broadcastMessage(
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
			createdAt: Date;
			sender: {
				id: string;
				firstName: string;
				lastName: string;
				avatar?: string | null;
				role: string;
			};
			receiver?: {
				id: string;
				firstName: string;
				lastName: string;
				avatar?: string | null;
				role: string;
			} | null;
		},
	) {
		void this.server.to(`chat_${chatRoomId}`).emit('newMessage', {
			chatRoomId,
			message,
		});

		// Also emit to general chat updates for chat list updates
		void this.server.emit('chatUpdated', { chatRoomId });
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
			const chatRoom = await this.chatRoomsService.createChatRoom(
				{
					name,
					type,
					loadId,
					participantIds,
				},
				userId,
			);

			// Join creator to the new chat room
			void client.join(`chat_${chatRoom.id}`);

			// Notify all participants about the new chat room
			for (const participantId of participantIds) {
				const participantSocketId = this.userSockets.get(participantId);
				if (participantSocketId) {
					void this.server
						.to(participantSocketId)
						.emit('chatRoomCreated', chatRoom);
				}
			}

			// Send confirmation back to creator
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
		// Notify all participants about the new chat room
		for (const participantId of participantIds) {
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
			participantIds: string[];
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId, participantIds } = data;
		const userId = client.userId;

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		try {
			// Add participants using the service
			const newParticipants = await this.chatRoomsService.addParticipants(
				chatRoomId,
				participantIds,
				userId,
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
			participantIds.forEach((participantId) => {
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

			console.log(
				`Participants added via WebSocket to room ${chatRoomId} by user ${userId}`,
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
		},
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		const { chatRoomId, participantId } = data;
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
			);

			// Notify all current participants about the removal
			void this.server
				.to(`chat_${chatRoomId}`)
				.emit('participantRemoved', {
					chatRoomId,
					removedUserId: participantId,
					removedBy: userId,
				});

			// Notify the removed participant
			const removedUserSocketId = this.userSockets.get(participantId);
			if (removedUserSocketId) {
				void this.server
					.to(removedUserSocketId)
					.emit('removedFromChatRoom', {
						chatRoomId,
						removedBy: userId,
					});
			}

			// Send confirmation back to remover
			client.emit('participantRemoved', { chatRoomId, result });

			console.log(
				`Participant removed via WebSocket from room ${chatRoomId} by user ${userId}`,
			);
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
}
