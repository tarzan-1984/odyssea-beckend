import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  appConfig,
  mailerConfig,
  jwtConfig,
  swaggerConfig,
} from './env.config';

describe('Environment Configuration', () => {
  let _configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    _configService = module.get<ConfigService>(ConfigService);
  });

  describe('appConfig', () => {
    it('should load app configuration correctly', () => {
      const originalEnv = process.env;

      process.env = {
        ...originalEnv,
        PORT: '3000',
        NODE_ENV: 'development',
        API_PREFIX: 'api',
        FRONTEND_URL: 'http://localhost:3000',
      };

      const config = appConfig();

      expect(config.port).toBe(3000);
      expect(config.nodeEnv).toBe('development');
      expect(config.apiPrefix).toBe('api');
      expect(config.frontendUrl).toBe('http://localhost:3000');

      process.env = originalEnv;
    });

    it('should use default frontend URL when FRONTEND_URL is not set', () => {
      const originalEnv = process.env;

      process.env = {
        ...originalEnv,
        PORT: '3000',
        NODE_ENV: 'development',
        API_PREFIX: 'api',
        // FRONTEND_URL not set
      };

      const config = appConfig();

      expect(config.frontendUrl).toBe('http://localhost:3000');

      process.env = originalEnv;
    });
  });

  describe('mailerConfig', () => {
    it('should load mailer configuration correctly', () => {
      const originalEnv = process.env;

      process.env = {
        ...originalEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'test@gmail.com',
        SMTP_PASS: 'password123',
        SMTP_FROM: 'test@gmail.com',
      };

      const config = mailerConfig();

      expect(config.host).toBe('smtp.gmail.com');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
      expect(config.user).toBe('test@gmail.com');
      expect(config.pass).toBe('password123');
      expect(config.from).toBe('test@gmail.com');

      process.env = originalEnv;
    });

    it('should use SMTP_USER as fallback for SMTP_FROM', () => {
      const originalEnv = process.env;

      process.env = {
        ...originalEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_USER: 'test@gmail.com',
        SMTP_PASS: 'password123',
        // SMTP_FROM not set
      };

      const config = mailerConfig();

      expect(config.from).toBe('test@gmail.com');

      process.env = originalEnv;
    });
  });

  describe('jwtConfig', () => {
    it('should load JWT configuration correctly', () => {
      const originalEnv = process.env;

      process.env = {
        ...originalEnv,
        JWT_SECRET: 'super-secret-key',
        JWT_EXPIRES_IN: '15m',
      };

      const config = jwtConfig();

      expect(config.secret).toBe('super-secret-key');
      expect(config.expiresIn).toBe('15m');

      process.env = originalEnv;
    });
  });

  describe('swaggerConfig', () => {
    it('should load Swagger configuration correctly', () => {
      const originalEnv = process.env;

      process.env = {
        ...originalEnv,
        SWAGGER_TITLE: 'Test API',
        SWAGGER_DESCRIPTION: 'Test API Description',
        SWAGGER_VERSION: '1.0.0',
      };

      const config = swaggerConfig();

      expect(config.title).toBe('Test API');
      expect(config.description).toBe('Test API Description');
      expect(config.version).toBe('1.0.0');

      process.env = originalEnv;
    });
  });
});
