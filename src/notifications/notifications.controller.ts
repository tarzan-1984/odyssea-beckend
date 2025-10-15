import { Controller, Get, Post, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get user notifications with pagination
   */
  @Get()
  async getNotifications(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 8;

    const result = await this.notificationsService.getUserNotifications(
      req.user.id,
      pageNum,
      limitNum,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Get unread notifications count
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req: AuthenticatedRequest) {
    const count = await this.notificationsService.getUnreadCount(req.user.id);

    return {
      success: true,
      data: {
        unreadCount: count,
      },
    };
  }

  /**
   * Mark notification as read
   */
  @Post(':id/read')
  async markAsRead(
    @Param('id') notificationId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const notification = await this.notificationsService.markAsRead(
      notificationId,
      req.user.id,
    );

    return {
      success: true,
      data: notification,
    };
  }

  /**
   * Mark all notifications as read
   */
  @Post('mark-all-read')
  async markAllAsRead(@Request() req: AuthenticatedRequest) {
    await this.notificationsService.markAllAsRead(req.user.id);

    return {
      success: true,
      message: 'All notifications marked as read',
    };
  }
}