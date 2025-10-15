import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class NotificationsWebSocketService {
  private readonly logger = new Logger(NotificationsWebSocketService.name);
  private server: Server;

  setServer(server: Server) {
    this.server = server;
  }

  /**
   * Send notification to specific user via WebSocket
   */
  async sendNotificationToUser(userId: string, notification: any) {
    try {
      if (!this.server) {
        this.logger.warn('WebSocket server not initialized');
        return;
      }

      // Send notification to specific user
      this.server.to(`user_${userId}`).emit('notification', notification);
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${userId}:`, error);
    }
  }

  /**
   * Send updated unread count to specific user
   */
  async sendUnreadCountToUser(userId: string, unreadCount: number) {
    try {
      if (!this.server) {
        this.logger.warn('WebSocket server not initialized');
        return;
      }

      // Send unread count update to specific user
      this.server.to(`user_${userId}`).emit('unreadCountUpdate', { unreadCount });
    } catch (error) {
      this.logger.error(`Failed to send unread count to user ${userId}:`, error);
    }
  }

  /**
   * Broadcast notification to all connected users (if needed)
   */
  async broadcastNotification(notification: any) {
    try {
      if (!this.server) {
        this.logger.warn('WebSocket server not initialized');
        return;
      }

      this.server.emit('notification', notification);
    } catch (error) {
      this.logger.error('Failed to broadcast notification:', error);
    }
  }
}
