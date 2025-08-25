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
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { MessagesService } from './messages.service';
import { ChatRoomsService } from './chat-rooms.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
@UseGuards(WsJwtGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Store user socket connections for real-time messaging
  private userSockets = new Map<string, string>();

  constructor(
    private messagesService: MessagesService,
    private chatRoomsService: ChatRoomsService,
  ) {}

  /**
   * Handle client connection
   * Authenticate user and join them to their chat rooms
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authentication is handled by WsJwtGuard
      const userId = client.userId;
      const userRole = client.userRole;

      if (!userId) {
        client.disconnect();
        return;
      }

      // Store socket connection for this user
      this.userSockets.set(userId, client.id);

      // Join user to all their chat rooms
      const chatRooms = await this.chatRoomsService.getUserChatRooms(userId);
      
      chatRooms.forEach((room) => {
        client.join(`chat_${room.id}`);
      });

      // Join user to role-based rooms for broadcast messages
      client.join(`role_${userRole}`);

      // Send connection confirmation
      client.emit('connected', {
        userId,
        userRole,
        chatRooms: chatRooms.length,
      });

      console.log(`User ${userId} connected to chat gateway`);
    } catch (error) {
      console.error('Connection error:', error);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   * Clean up user socket connections
   */
  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (userId) {
      this.userSockets.delete(userId);
      console.log(`User ${userId} disconnected from chat gateway`);
    }
  }

  /**
   * Handle joining a specific chat room
   * Used when user opens a chat conversation
   */
  @SubscribeMessage('joinChatRoom')
  async handleJoinChatRoom(
    @MessageBody() data: { chatRoomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { chatRoomId } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    try {
      // Verify user has access to this chat room
      await this.chatRoomsService.getChatRoom(chatRoomId, userId);
      
      // Join the specific chat room
      client.join(`chat_${chatRoomId}`);
      
      // Mark messages as read
      await this.messagesService.markMessagesAsRead(chatRoomId, userId);

      client.emit('joinedChatRoom', { chatRoomId });
      
      // Notify other participants that user is typing
      client.to(`chat_${chatRoomId}`).emit('userJoined', { userId, chatRoomId });
    } catch (error) {
      client.emit('error', { message: 'Failed to join chat room' });
    }
  }

  /**
   * Handle leaving a chat room
   * Used when user closes a chat conversation
   */
  @SubscribeMessage('leaveChatRoom')
  async handleLeaveChatRoom(
    @MessageBody() data: { chatRoomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { chatRoomId } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    client.leave(`chat_${chatRoomId}`);
    client.emit('leftChatRoom', { chatRoomId });
    
    // Notify other participants
    client.to(`chat_${chatRoomId}`).emit('userLeft', { userId, chatRoomId });
  }

  /**
   * Handle typing indicators
   * Shows when user is typing a message
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

    // Broadcast typing indicator to other participants
    client.to(`chat_${chatRoomId}`).emit('userTyping', {
      userId,
      chatRoomId,
      isTyping,
    });
  }

  /**
   * Handle message delivery confirmation
   * Used to track message delivery status
   */
  @SubscribeMessage('messageDelivered')
  async handleMessageDelivered(
    @MessageBody() data: { messageId: string; chatRoomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { messageId, chatRoomId } = data;
    const userId = client.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

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

    // Mark message as read
    await this.messagesService.markMessagesAsRead(chatRoomId, userId);
    
    // Notify sender that message was read
    const message = await this.messagesService.getMessageById(messageId);
    if (message && message.senderId !== userId) {
      const senderSocketId = this.userSockets.get(message.senderId);
      if (senderSocketId) {
        this.server.to(senderSocketId).emit('messageRead', { messageId, readBy: userId });
      }
    }
  }

  /**
   * Broadcast message to all participants in a chat room
   * Called by MessagesService after saving message to database
   */
  async broadcastMessage(chatRoomId: string, message: any) {
    this.server.to(`chat_${chatRoomId}`).emit('newMessage', {
      chatRoomId,
      message,
    });

    // Also emit to general chat updates for chat list updates
    this.server.emit('chatUpdated', { chatRoomId });
  }

  /**
   * Send notification to specific user
   * Used for offline notifications
   */
  async sendUserNotification(userId: string, notification: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('notification', notification);
    }
  }

  /**
   * Broadcast to all users with specific role
   * Useful for system announcements
   */
  async broadcastToRole(role: string, message: any) {
    this.server.to(`role_${role}`).emit('roleBroadcast', {
      role,
      message,
    });
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
}
