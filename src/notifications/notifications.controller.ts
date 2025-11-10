import {
	Controller,
	Get,
	Post,
	Param,
	Body,
	Query,
	UseGuards,
	Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { PrismaService } from '../prisma/prisma.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
	constructor(
		private readonly notificationsService: NotificationsService,
		private readonly prisma: PrismaService,
	) {}

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
		const count = await this.notificationsService.getUnreadCount(
			req.user.id,
		);

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

	/**
	 * Register Expo push token for current user
	 */
	@Post('register-token')
	async registerToken(
		@Request() req: AuthenticatedRequest,
		@Body() body: { token: string; platform?: string; deviceId?: string },
	) {
		const { token, platform, deviceId } = body || {};
		if (!token || typeof token !== 'string') {
			return { success: false, error: 'token is required' };
		}
		await this.prisma.pushToken.upsert({
			where: { token },
			update: { userId: req.user.id, platform, deviceId },
			create: { token, userId: req.user.id, platform, deviceId },
		});
		return { success: true };
	}

	/**
	 * Unregister Expo push token for current user.
	 * If token is provided - deletes only that token; if omitted - deletes all tokens for the user.
	 */
	@Post('unregister-token')
	async unregisterToken(
		@Request() req: AuthenticatedRequest,
		@Body() body: { token?: string },
	) {
		const token = body?.token;
		if (token) {
			await this.prisma.pushToken.deleteMany({
				where: { userId: req.user.id, token },
			});
			return { success: true, removed: 1 };
		}
		// Remove all tokens for current user (useful for full logout from all devices if called intentionally)
		const res = await this.prisma.pushToken.deleteMany({
			where: { userId: req.user.id },
		});
		return { success: true, removed: res.count };
	}
}
