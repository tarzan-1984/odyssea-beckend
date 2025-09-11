import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';
import * as nodemailer from 'nodemailer';

// Mock nodemailer
jest.mock('nodemailer');

describe('MailerService', () => {
	let service: MailerService;
	let _configService: ConfigService;
	let mockTransporter: any;

	const mockConfigService = {
		get: jest.fn(),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MailerService,
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile();

		service = module.get<MailerService>(MailerService);
		_configService = module.get<ConfigService>(ConfigService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('onModuleInit', () => {
		it('should initialize transporter with valid config', async () => {
			const mockConfig = {
				host: 'smtp.example.com',
				port: 587,
				secure: false,
				user: 'test@example.com',
				pass: 'password',
				from: 'test@example.com',
			};

			mockConfigService.get.mockReturnValue(mockConfig);
			mockTransporter = {
				verify: jest.fn().mockResolvedValue(true),
				sendMail: jest.fn(),
			};
			(nodemailer.createTransport as jest.Mock).mockReturnValue(
				mockTransporter,
			);

			await service.onModuleInit();

			expect(nodemailer.createTransport).toHaveBeenCalledWith({
				host: mockConfig.host,
				port: mockConfig.port,
				secure: mockConfig.secure,
				auth: {
					user: mockConfig.user,
					pass: mockConfig.pass,
				},
			});
			expect(mockTransporter.verify).toHaveBeenCalled();
		});

		it('should handle incomplete config gracefully', async () => {
			mockConfigService.get.mockReturnValue({
				host: 'smtp.example.com',
				// Missing user and pass
			});

			await service.onModuleInit();

			expect(nodemailer.createTransport).not.toHaveBeenCalled();
		});
	});

	describe('sendMail', () => {
		beforeEach(() => {
			const mockConfig = {
				host: 'smtp.example.com',
				port: 587,
				secure: false,
				user: 'test@example.com',
				pass: 'password',
				from: 'test@example.com',
			};

			mockConfigService.get.mockReturnValue(mockConfig);
			mockTransporter = {
				verify: jest.fn().mockResolvedValue(true),
				sendMail: jest.fn(),
			};
			(nodemailer.createTransport as jest.Mock).mockReturnValue(
				mockTransporter,
			);
		});

		it('should send email successfully', async () => {
			await service.onModuleInit();

			const mockInfo = { messageId: 'test-message-id' };
			mockTransporter.sendMail.mockResolvedValue(mockInfo);

			const result = await service.sendMail({
				to: 'recipient@example.com',
				subject: 'Test Subject',
				text: 'Test content',
			});

			expect(result).toBe(true);
			expect(mockTransporter.sendMail).toHaveBeenCalledWith({
				from: 'test@example.com',
				to: 'recipient@example.com',
				subject: 'Test Subject',
				text: 'Test content',
				html: undefined,
			});
		});

		it('should return false when transporter is not initialized', async () => {
			const result = await service.sendMail({
				to: 'recipient@example.com',
				subject: 'Test Subject',
				text: 'Test content',
			});

			expect(result).toBe(false);
		});

		it('should handle send mail errors', async () => {
			await service.onModuleInit();

			mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));

			const result = await service.sendMail({
				to: 'recipient@example.com',
				subject: 'Test Subject',
				text: 'Test content',
			});

			expect(result).toBe(false);
		});
	});

	describe('sendTextEmail', () => {
		beforeEach(async () => {
			const mockConfig = {
				host: 'smtp.example.com',
				port: 587,
				secure: false,
				user: 'test@example.com',
				pass: 'password',
				from: 'test@example.com',
			};

			mockConfigService.get.mockReturnValue(mockConfig);
			mockTransporter = {
				verify: jest.fn().mockResolvedValue(true),
				sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
			};
			(nodemailer.createTransport as jest.Mock).mockReturnValue(
				mockTransporter,
			);
			await service.onModuleInit();
		});

		it('should send text email successfully', async () => {
			const result = await service.sendTextEmail(
				'recipient@example.com',
				'Test Subject',
				'Test content',
			);

			expect(result).toBe(true);
			expect(mockTransporter.sendMail).toHaveBeenCalledWith({
				from: 'test@example.com',
				to: 'recipient@example.com',
				subject: 'Test Subject',
				text: 'Test content',
				html: undefined,
			});
		});
	});

	describe('sendHtmlEmail', () => {
		beforeEach(async () => {
			const mockConfig = {
				host: 'smtp.example.com',
				port: 587,
				secure: false,
				user: 'test@example.com',
				pass: 'password',
				from: 'test@example.com',
			};

			mockConfigService.get.mockReturnValue(mockConfig);
			mockTransporter = {
				verify: jest.fn().mockResolvedValue(true),
				sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
			};
			(nodemailer.createTransport as jest.Mock).mockReturnValue(
				mockTransporter,
			);
			await service.onModuleInit();
		});

		it('should send HTML email successfully', async () => {
			const result = await service.sendHtmlEmail(
				'recipient@example.com',
				'Test Subject',
				'<h1>Test HTML content</h1>',
			);

			expect(result).toBe(true);
			expect(mockTransporter.sendMail).toHaveBeenCalledWith({
				from: 'test@example.com',
				to: 'recipient@example.com',
				subject: 'Test Subject',
				text: undefined,
				html: '<h1>Test HTML content</h1>',
			});
		});
	});
});
