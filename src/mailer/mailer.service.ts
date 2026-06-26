import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailerConfig } from '../config/env.config';

interface SendMailResult {
	messageId: string;
	[key: string]: any;
}

export interface SendMailOptions {
	to: string;
	subject: string;
	text?: string;
	html?: string;
	from?: string;
	replyTo?: string;
	cc?: string | string[];
}

@Injectable()
export class MailerService implements OnModuleInit {
	private readonly logger = new Logger(MailerService.name);
	private transporter: nodemailer.Transporter;

	constructor(private readonly configService: ConfigService) {}

	async onModuleInit() {
		await this.initializeTransporter();
	}

	private async initializeTransporter() {
		const mailerConfig = this.configService.get<MailerConfig>('mailer');

		if (!mailerConfig?.host || !mailerConfig?.user || !mailerConfig?.pass) {
			this.logger.warn(
				'SMTP configuration is incomplete. Mailer service will not be available.',
			);
			return;
		}

		this.transporter = nodemailer.createTransport({
			host: mailerConfig.host,
			port: mailerConfig.port,
			secure: mailerConfig.secure,
			auth: {
				user: mailerConfig.user,
				pass: mailerConfig.pass,
			},
		});

		// Verify connection configuration
		try {
			await this.transporter.verify();
			this.logger.log('✅ SMTP connection verified successfully');
		} catch (error) {
			this.logger.error('❌ SMTP connection verification failed', error);
		}
	}

	/**
	 * Send an email using the configured SMTP transporter
	 * @param options - Email options including recipient, subject, and content
	 * @returns Promise<boolean> - True if email was sent successfully, false otherwise
	 */
	async sendMail(options: SendMailOptions): Promise<boolean> {
		if (!this.transporter) {
			this.logger.error('❌ SMTP transporter not initialized');
			return false;
		}

		const { to, subject, text, html, from, replyTo, cc } = options;
		const mailerConfig = this.configService.get<MailerConfig>('mailer');

		if (!mailerConfig) {
			this.logger.error('❌ Mailer configuration not found');
			return false;
		}

		try {
			const mailOptions = {
				from: from || mailerConfig.from,
				to,
				subject,
				text,
				html,
				...(replyTo ? { replyTo } : {}),
				...(cc ? { cc } : {}),
			};

			const info = (await this.transporter.sendMail(
				mailOptions,
			)) as SendMailResult;
			this.logger.log(
				`📧 Email sent successfully to ${to}: ${info.messageId}`,
			);
			return true;
		} catch (error) {
			this.logger.error(`❌ Failed to send email to ${to}`, error);
			return false;
		}
	}

	/**
	 * Send a simple text email
	 * @param to - Recipient email address
	 * @param subject - Email subject
	 * @param text - Plain text content
	 * @returns Promise<boolean> - True if email was sent successfully
	 */
	async sendTextEmail(
		to: string,
		subject: string,
		text: string,
		options?: Pick<SendMailOptions, 'from' | 'replyTo' | 'cc'>,
	): Promise<boolean> {
		return this.sendMail({ to, subject, text, ...options });
	}

	/**
	 * Send an HTML email
	 * @param to - Recipient email address
	 * @param subject - Email subject
	 * @param html - HTML content
	 * @returns Promise<boolean> - True if email was sent successfully
	 */
	async sendHtmlEmail(
		to: string,
		subject: string,
		html: string,
		options?: Pick<SendMailOptions, 'from' | 'replyTo' | 'cc'>,
	): Promise<boolean> {
		return this.sendMail({ to, subject, html, ...options });
	}

	/**
	 * Send an email with both text and HTML content
	 * @param to - Recipient email address
	 * @param subject - Email subject
	 * @param text - Plain text content
	 * @param html - HTML content
	 * @returns Promise<boolean> - True if email was sent successfully
	 */
	async sendEmail(
		to: string,
		subject: string,
		text: string,
		html?: string,
		options?: Pick<SendMailOptions, 'from' | 'replyTo' | 'cc'>,
	): Promise<boolean> {
		return this.sendMail({ to, subject, text, html, ...options });
	}
}
