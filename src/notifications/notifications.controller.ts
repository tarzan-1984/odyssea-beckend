import {
	Controller,
	Get,
	Post,
	Param,
	Body,
	Query,
	UseGuards,
	Request,
	ForbiddenException,
	BadRequestException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CustomPushBackgroundService } from './custom-push-background.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
	constructor(
		private readonly notificationsService: NotificationsService,
		private readonly customPushBackgroundService: CustomPushBackgroundService,
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

	/**
	 * Send custom push: any authenticated user may target a single user (userId or externalId).
	 * Broadcast to all ACTIVE users with tokens remains administrator-only.
	 */
	@Post('push')
	async sendCustomPush(
		@Request() req: AuthenticatedRequest,
		@Body()
		body: {
			message: string;
			userId?: string | null;
			externalId?: string | null;
			platform?: 'all' | 'ios' | 'android' | null;
		},
	) {
		const message = typeof body?.message === 'string' ? body.message.trim() : '';
		let userId =
			typeof body?.userId === 'string' && body.userId.trim()
				? body.userId.trim()
				: undefined;
		const externalId =
			typeof body?.externalId === 'string' && body.externalId.trim()
				? body.externalId.trim()
				: undefined;

		if (!userId && externalId) {
			const user = await this.prisma.user.findUnique({
				where: { externalId },
				select: { id: true },
			});
			if (!user) {
				throw new BadRequestException('No user found for this externalId');
			}
			userId = user.id;
		}

		const platformRaw =
			typeof body?.platform === 'string' ? body.platform.trim().toLowerCase() : '';
		const platform =
			platformRaw === 'ios' || platformRaw === 'android'
				? (platformRaw as 'ios' | 'android')
				: platformRaw === 'all' || !platformRaw
					? undefined
					: null;

		if (!message) {
			throw new BadRequestException('message is required');
		}
		if (platform === null) {
			throw new BadRequestException('platform must be one of: all, ios, android');
		}

		if (!userId && req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can send a broadcast push to all users',
			);
		}

		if (!userId) {
			const result = await this.customPushBackgroundService.enqueueBroadcast({
				message,
				platform,
			});
			return { success: true, data: result };
		}

		const result = await this.notificationsService.sendCustomPush({
			message,
			userId,
		});

		return { success: true, data: result };
	}

	/**
	 * Send custom email to a single driver (userId, externalId, or email).
	 */
	@Post('email')
	async sendCustomEmail(
		@Request() req: AuthenticatedRequest,
		@Body()
		body: {
			message: string;
			subject?: string | null;
			userId?: string | null;
			externalId?: string | null;
			email?: string | null;
		},
	) {
		const message = typeof body?.message === 'string' ? body.message.trim() : '';
		const subject =
			typeof body?.subject === 'string' && body.subject.trim()
				? body.subject.trim()
				: 'Odyssea';
		let userId =
			typeof body?.userId === 'string' && body.userId.trim()
				? body.userId.trim()
				: undefined;
		const externalId =
			typeof body?.externalId === 'string' && body.externalId.trim()
				? body.externalId.trim()
				: undefined;
		const email =
			typeof body?.email === 'string' && body.email.trim()
				? body.email.trim()
				: undefined;

		if (!message) {
			throw new BadRequestException('message is required');
		}

		if (!userId && !externalId && !email) {
			throw new BadRequestException(
				'userId, externalId, or email is required',
			);
		}

		if (!userId && externalId) {
			const user = await this.prisma.user.findUnique({
				where: { externalId },
				select: { id: true },
			});
			if (!user) {
				throw new BadRequestException('No user found for this externalId');
			}
			userId = user.id;
		}

		const sender = await this.prisma.user.findUnique({
			where: { id: req.user.id },
			select: { email: true, firstName: true, lastName: true },
		});
		const senderEmail = (sender?.email ?? req.user.email ?? '').trim();
		if (!senderEmail) {
			throw new BadRequestException('Your account has no email address');
		}
		const senderName = `${sender?.firstName ?? ''} ${sender?.lastName ?? ''}`.trim();
		const senderFrom = senderName
			? `"${senderName}" <${senderEmail}>`
			: senderEmail;

		const result = await this.notificationsService.sendCustomEmail({
			message,
			subject,
			userId,
			externalId,
			email,
			from: senderFrom,
			replyTo: senderEmail,
		});

		if (!result.sent) {
			if (result.reason === 'no_email') {
				throw new BadRequestException('Driver has no email address');
			}
			if (result.reason === 'send_failed') {
				throw new BadRequestException('Failed to send email');
			}
			throw new BadRequestException('Failed to send email');
		}

		return { success: true, data: result };
	}

	/**
	 * Open TMS endpoint: send custom push by TMS externalId.
	 */
	@Post('push/tms')
	@SkipAuth()
	async sendTmsPush(
		@Body()
		body: {
			externalId?: string;
			message?: string;
		},
	) {
		const externalId =
			typeof body?.externalId === 'string' ? body.externalId.trim() : '';
		const message =
			typeof body?.message === 'string' ? body.message.trim() : '';

		if (!externalId) {
			throw new BadRequestException('externalId is required');
		}
		if (!message) {
			throw new BadRequestException('message is required');
		}

		const result = await this.notificationsService.sendTmsPushByExternalId({
			externalId,
			message,
		});

		return { success: result.sent, data: result };
	}
}
