import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailerModule } from './mailer.module';
import { MailerService } from './mailer.service';

describe('MailerModule', () => {
	let module: TestingModule;

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [MailerModule],
			providers: [
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn((key: string) => {
							const config = {
								'mailer.host': 'smtp.example.com',
								'mailer.port': 587,
								'mailer.secure': false,
								'mailer.user': 'test@example.com',
								'mailer.pass': 'password',
								'mailer.from': 'noreply@example.com',
							};
							return config[key];
						}),
					},
				},
			],
		}).compile();
	});

	afterEach(async () => {
		if (module) {
			await module.close();
		}
	});

	it('should be defined', () => {
		expect(module).toBeDefined();
	});

	it('should provide MailerService', () => {
		const mailerService = module.get<MailerService>(MailerService);
		expect(mailerService).toBeDefined();
	});

	it('should export MailerService', () => {
		const mailerService = module.get<MailerService>(MailerService);
		expect(mailerService).toBeDefined();
	});

	it('should provide MailerService instance', () => {
		const mailerService = module.get<MailerService>(MailerService);
		expect(mailerService).toBeDefined();
		expect(typeof mailerService.sendMail).toBe('function');
	});

	it('should have MailerService as provider', () => {
		const mailerService = module.get<MailerService>(MailerService);
		expect(mailerService).toBeDefined();
	});
});
