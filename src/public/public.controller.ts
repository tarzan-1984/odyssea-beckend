import { BadRequestException, Controller, Post, Body } from '@nestjs/common';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';

@Controller('public')
export class PublicController {
	constructor(
		private readonly mailerService: MailerService,
		private readonly prisma: PrismaService,
		private readonly appSettingsService: AppSettingsService,
	) {}

	@SkipAuth()
	@Post('account-deletion-request')
	async accountDeletionRequest(
		@Body() body: { email?: string; comment?: string },
	) {
		const email = typeof body?.email === 'string' ? body.email.trim() : '';
		const comment =
			typeof body?.comment === 'string' ? body.comment.trim() : '';

		if (!email) {
			throw new BadRequestException('email is required');
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			throw new BadRequestException('email is invalid');
		}
		if (comment.length > 2000) {
			throw new BadRequestException('comment is too long');
		}

		const user = await this.prisma.user.findFirst({
			where: { email: { equals: email, mode: 'insensitive' } },
			select: { id: true },
		});
		if (!user) {
			throw new BadRequestException('User not found');
		}

		const settings = await this.appSettingsService.getGlobal();
		const to = String(settings.accountDeletionRequestEmail ?? '').trim();
		if (!to) {
			throw new BadRequestException('Recipient email is not configured');
		}

		const subject = 'Account Deletion Request';
		const safeComment = comment ? comment.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
		const html = `
			<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5">
				<h2 style="margin: 0 0 12px 0;">Account Deletion Request</h2>
				<p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${email}</p>
				<p style="margin: 0 0 8px 0;"><strong>Comment:</strong> ${safeComment || '-'}</p>
				<p style="margin: 16px 0 0 0; color: #666;">This request was submitted from /delete-account.</p>
			</div>
		`;

		const sent = await this.mailerService.sendHtmlEmail(to, subject, html);
		if (!sent) {
			throw new BadRequestException('Failed to send email');
		}

		return { success: true };
	}
}

