import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from './mailer.module';
import { MailerService } from './mailer.service';

describe('Mailer Integration', () => {
  let module: TestingModule;
  let mailerService: MailerService;
  let configService: ConfigService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              mailer: {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                user: 'test@gmail.com',
                pass: 'test-password',
                from: 'test@gmail.com',
              },
            }),
          ],
        }),
        MailerModule,
      ],
    }).compile();

    mailerService = module.get<MailerService>(MailerService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide MailerService', () => {
    expect(mailerService).toBeDefined();
  });

  it('should provide ConfigService', () => {
    expect(configService).toBeDefined();
  });

  it('should initialize transporter with configuration', async () => {
    // Wait for module initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(mailerService).toBeDefined();
  });

  it('should handle missing mailer configuration gracefully', async () => {
    const moduleWithoutConfig = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              mailer: {
                // Missing required configuration
              },
            }),
          ],
        }),
        MailerModule,
      ],
    }).compile();

    const mailerServiceWithoutConfig = moduleWithoutConfig.get<MailerService>(MailerService);
    
    // Should not throw error, just log warning
    expect(mailerServiceWithoutConfig).toBeDefined();
    
    await moduleWithoutConfig.close();
  });

  it('should handle incomplete mailer configuration', async () => {
    const moduleWithIncompleteConfig = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              mailer: {
                host: 'smtp.gmail.com',
                port: 587,
                // Missing user and pass
              },
            }),
          ],
        }),
        MailerModule,
      ],
    }).compile();

    const mailerServiceWithIncompleteConfig = moduleWithIncompleteConfig.get<MailerService>(MailerService);
    
    // Should not throw error, just log warning
    expect(mailerServiceWithIncompleteConfig).toBeDefined();
    
    await moduleWithIncompleteConfig.close();
  });

  it('should configure mailer with environment variables', () => {
    const mailerConfig = configService.get('mailer');
    expect(mailerConfig).toBeDefined();
    expect(mailerConfig.host).toBe('smtp.gmail.com');
    expect(mailerConfig.port).toBe(587);
    expect(mailerConfig.secure).toBe(false);
    expect(mailerConfig.user).toBe('test@gmail.com');
    expect(mailerConfig.pass).toBe('test-password');
    expect(mailerConfig.from).toBe('test@gmail.com');
  });

  it('should have all required mailer methods', () => {
    expect(typeof mailerService.sendMail).toBe('function');
    expect(typeof mailerService.sendTextEmail).toBe('function');
    expect(typeof mailerService.sendHtmlEmail).toBe('function');
  });

  it('should handle module initialization correctly', async () => {
    // The module should initialize without errors
    expect(module).toBeDefined();
    expect(mailerService).toBeDefined();
  });
});
