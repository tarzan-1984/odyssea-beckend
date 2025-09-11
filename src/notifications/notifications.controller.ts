import {
	Controller,
	Get,
	Post,
	Param,
	Query,
	UseGuards,
	Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
	constructor(private readonly notificationsService: NotificationsService) {}

	/**
	 * Get notifications for the current user
	 */
	@Get()
	async getUserNotifications(
		@Request() req: AuthenticatedRequest,
		@Query('page') page: string = '1',
		@Query('limit') limit: string = '20',
	) {
		const userId = req.user.id;
		const pageNum = parseInt(page, 10);
		const limitNum = parseInt(limit, 10);

		return await this.notificationsService.getUserNotifications(
			userId,
			pageNum,
			limitNum,
		);
	}

	/**
	 * Mark a specific notification as read
	 */
	@Post(':id/read')
	async markNotificationAsRead(
		@Request() req: AuthenticatedRequest,
		@Param('id') notificationId: string,
	) {
		const userId = req.user.id;
		return await this.notificationsService.markNotificationAsRead(
			notificationId,
			userId,
		);
	}

	/**
	 * Mark all notifications as read for the current user
	 */
	@Post('mark-all-read')
	async markAllNotificationsAsRead(@Request() req: AuthenticatedRequest) {
		const userId = req.user.id;
		return await this.notificationsService.markAllNotificationsAsRead(
			userId,
		);
	}
}
