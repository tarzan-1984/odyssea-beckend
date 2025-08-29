import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  databaseConfig,
  appConfig,
  jwtConfig,
  swaggerConfig,
  mailerConfig,
} from './env.config';

describe('Environment Configuration', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'database.url': 'postgresql://test:test@localhost:5432/testdb',
                'app.port': 3000,
                'app.nodeEnv': 'test',
                'jwt.secret': 'test-secret',
                'jwt.expiresIn': '1h',
                'jwt.refreshExpiresIn': '7d',
                'swagger.title': 'Test API',
                'swagger.description': 'Test API Description',
                'swagger.version': '1.0.0',
                'mailer.host': 'smtp.test.com',
                'mailer.port': 587,
                'mailer.secure': false,
                'mailer.user': 'test@test.com',
                'mailer.pass': 'test-password',
                'mailer.from': 'test@test.com',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  describe('databaseConfig', () => {
    it('should return database configuration', () => {
      const config = databaseConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('url');
    });

    it('should use DATABASE_URL environment variable', () => {
      const originalEnv = process.env.DATABASE_URL;
      process.env.DATABASE_URL =
        'postgresql://custom:custom@localhost:5432/customdb';

      const config = databaseConfig();
      expect(config).toHaveProperty('url');
      expect(config.url).toBe(
        'postgresql://custom:custom@localhost:5432/customdb',
      );

      // Restore original environment
      if (originalEnv) {
        process.env.DATABASE_URL = originalEnv;
      } else {
        delete process.env.DATABASE_URL;
      }
    });
  });

  describe('appConfig', () => {
    it('should return app configuration', () => {
      const config = appConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('nodeEnv');
    });

    it('should use default port when PORT not set', () => {
      const originalEnv = process.env.PORT;
      delete process.env.PORT;

      const config = appConfig();
      expect(config.port).toBeUndefined();

      // Restore original environment
      if (originalEnv) {
        process.env.PORT = originalEnv;
      }
    });

    it('should use PORT environment variable when set', () => {
      const originalEnv = process.env.PORT;
      process.env.PORT = '4000';

      const config = appConfig();
      expect(config.port).toBe(4000);

      // Restore original environment
      if (originalEnv) {
        process.env.PORT = originalEnv;
      } else {
        delete process.env.PORT;
      }
    });

    it('should use NODE_ENV environment variable', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const config = appConfig();
      expect(config.nodeEnv).toBe('production');

      // Restore original environment
      if (originalEnv) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    });
  });

  describe('jwtConfig', () => {
    it('should return JWT configuration', () => {
      const config = jwtConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('secret');
      expect(config).toHaveProperty('expiresIn');
      expect(config).toHaveProperty('refreshExpiresIn');
    });

    it('should use JWT_SECRET environment variable', () => {
      const originalEnv = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'custom-jwt-secret';

      const config = jwtConfig();
      expect(config.secret).toBe('custom-jwt-secret');

      // Restore original environment
      if (originalEnv) {
        process.env.JWT_SECRET = originalEnv;
      } else {
        delete process.env.JWT_SECRET;
      }
    });

    it('should use JWT_EXPIRES_IN environment variable', () => {
      const originalEnv = process.env.JWT_EXPIRES_IN;
      process.env.JWT_EXPIRES_IN = '2h';

      const config = jwtConfig();
      expect(config.expiresIn).toBe('2h');

      // Restore original environment
      if (originalEnv) {
        process.env.JWT_EXPIRES_IN = originalEnv;
      } else {
        delete process.env.JWT_EXPIRES_IN;
      }
    });

    it('should use JWT_REFRESH_EXPIRES_IN environment variable', () => {
      const originalEnv = process.env.JWT_REFRESH_EXPIRES_IN;
      process.env.JWT_REFRESH_EXPIRES_IN = '14d';

      const config = jwtConfig();
      expect(config.refreshExpiresIn).toBe('14d');

      // Restore original environment
      if (originalEnv) {
        process.env.JWT_REFRESH_EXPIRES_IN = originalEnv;
      } else {
        delete process.env.JWT_REFRESH_EXPIRES_IN;
      }
    });
  });

  describe('swaggerConfig', () => {
    it('should return Swagger configuration', () => {
      const config = swaggerConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('title');
      expect(config).toHaveProperty('description');
      expect(config).toHaveProperty('version');
    });

    it('should use SWAGGER_TITLE environment variable', () => {
      const originalEnv = process.env.SWAGGER_TITLE;
      process.env.SWAGGER_TITLE = 'Custom API Title';

      const config = swaggerConfig();
      expect(config.title).toBe('Custom API Title');

      // Restore original environment
      if (originalEnv) {
        process.env.SWAGGER_TITLE = originalEnv;
      } else {
        delete process.env.SWAGGER_TITLE;
      }
    });

    it('should use SWAGGER_DESCRIPTION environment variable', () => {
      const originalEnv = process.env.SWAGGER_DESCRIPTION;
      process.env.SWAGGER_DESCRIPTION = 'Custom API Description';

      const config = swaggerConfig();
      expect(config.description).toBe('Custom API Description');

      // Restore original environment
      if (originalEnv) {
        process.env.SWAGGER_DESCRIPTION = originalEnv;
      } else {
        delete process.env.SWAGGER_DESCRIPTION;
      }
    });

    it('should use SWAGGER_VERSION environment variable', () => {
      const originalEnv = process.env.SWAGGER_VERSION;
      process.env.SWAGGER_VERSION = '2.0.0';

      const config = swaggerConfig();
      expect(config.version).toBe('2.0.0');

      // Restore original environment
      if (originalEnv) {
        process.env.SWAGGER_VERSION = originalEnv;
      } else {
        delete process.env.SWAGGER_VERSION;
      }
    });
  });

  describe('mailerConfig', () => {
    it('should return Mailer configuration', () => {
      const config = mailerConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('host');
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('secure');
      expect(config).toHaveProperty('user');
      expect(config).toHaveProperty('pass');
      expect(config).toHaveProperty('from');
    });

    it('should use SMTP_HOST environment variable', () => {
      const originalEnv = process.env.SMTP_HOST;
      process.env.SMTP_HOST = 'smtp.custom.com';

      const config = mailerConfig();
      expect(config.host).toBe('smtp.custom.com');

      // Restore original environment
      if (originalEnv) {
        process.env.SMTP_HOST = originalEnv;
      } else {
        delete process.env.SMTP_HOST;
      }
    });

    it('should use SMTP_PORT environment variable', () => {
      const originalEnv = process.env.SMTP_PORT;
      process.env.SMTP_PORT = '465';

      const config = mailerConfig();
      expect(config.port).toBe(465);

      // Restore original environment
      if (originalEnv) {
        process.env.SMTP_PORT = originalEnv;
      } else {
        delete process.env.SMTP_PORT;
      }
    });

    it('should use SMTP_SECURE environment variable', () => {
      const originalEnv = process.env.SMTP_SECURE;
      process.env.SMTP_SECURE = 'true';

      const config = mailerConfig();
      expect(config.secure).toBe(true);

      // Restore original environment
      if (originalEnv) {
        process.env.SMTP_SECURE = originalEnv;
      } else {
        delete process.env.SMTP_SECURE;
      }
    });

    it('should use SMTP_USER environment variable', () => {
      const originalEnv = process.env.SMTP_USER;
      process.env.SMTP_USER = 'custom@custom.com';

      const config = mailerConfig();
      expect(config.user).toBe('custom@custom.com');

      // Restore original environment
      if (originalEnv) {
        process.env.SMTP_USER = originalEnv;
      } else {
        delete process.env.SMTP_USER;
      }
    });

    it('should use SMTP_PASS environment variable', () => {
      const originalEnv = process.env.SMTP_PASS;
      process.env.SMTP_PASS = 'custom-password';

      const config = mailerConfig();
      expect(config.pass).toBe('custom-password');

      // Restore original environment
      if (originalEnv) {
        process.env.SMTP_PASS = originalEnv;
      } else {
        delete process.env.SMTP_PASS;
      }
    });

    it('should use SMTP_FROM environment variable', () => {
      const originalEnv = process.env.SMTP_FROM;
      process.env.SMTP_FROM = 'noreply@custom.com';

      const config = mailerConfig();
      expect(config.from).toBe('noreply@custom.com');

      // Restore original environment
      if (originalEnv) {
        process.env.SMTP_FROM = originalEnv;
      } else {
        delete process.env.SMTP_FROM;
      }
    });
  });
});
