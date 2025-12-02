import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class NotificationsWebSocketService {
  private readonly logger = new Logger(NotificationsWebSocketService.name);

  // Private/authenticated WebSocket server (chat / admin UI)
  private server: Server;

  // Public WebSocket namespace (for unauthenticated viewers, e.g. public map)
  private publicServer: Server;

  setServer(server: Server) {
    this.server = server;
  }

  setPublicServer(server: Server) {
    this.publicServer = server;
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
   * Send user location update event (used by admin/Next.js UI)
   */
  async sendUserLocationUpdate(userId: string, payload: any) {
    try {
      // Send to authenticated user-specific room (for internal tools / admin UI)
      if (this.server) {
        this.server.to(`user_${userId}`).emit('userLocationUpdate', payload);
      } else {
        this.logger.warn('Private WebSocket server not initialized for userLocationUpdate');
      }

      // Also broadcast to public namespace so any anonymous viewer can see updates
      if (this.publicServer) {
        this.publicServer.emit('userLocationUpdate', payload);
      } else {
        this.logger.warn('Public WebSocket server not initialized for userLocationUpdate');
      }
    } catch (error) {
      this.logger.error(`Failed to send user location update for user ${userId}:`, error);
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
