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
      expect(config).toHaveProperty('database');
      expect(config.database).toHaveProperty('url');
    });

    it('should use DATABASE_URL environment variable', () => {
      const originalEnv = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://custom:custom@localhost:5432/customdb';
      
      const config = databaseConfig();
      expect(config.database.url).toBe('postgresql://custom:custom@localhost:5432/customdb');
      
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
      expect(config).toHaveProperty('app');
      expect(config.app).toHaveProperty('port');
      expect(config.app).toHaveProperty('nodeEnv');
    });

    it('should use default port when PORT not set', () => {
      const originalEnv = process.env.PORT;
      delete process.env.PORT;
      
      const config = appConfig();
      expect(config.app.port).toBe(3000);
      
      // Restore original environment
      if (originalEnv) {
        process.env.PORT = originalEnv;
      }
    });

    it('should use PORT environment variable when set', () => {
      const originalEnv = process.env.PORT;
      process.env.PORT = '4000';
      
      const config = appConfig();
      expect(config.app.port).toBe(4000);
      
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
      expect(config.app.nodeEnv).toBe('production');
      
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
      expect(config).toHaveProperty('jwt');
      expect(config.jwt).toHaveProperty('secret');
      expect(config.jwt).toHaveProperty('expiresIn');
      expect(config.jwt).toHaveProperty('refreshExpiresIn');
    });

    it('should use JWT_SECRET environment variable', () => {
      const originalEnv = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'custom-jwt-secret';
      
      const config = jwtConfig();
      expect(config.jwt.secret).toBe('custom-jwt-secret');
      
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
      expect(config.jwt.expiresIn).toBe('2h');
      
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
      expect(config.jwt.refreshExpiresIn).toBe('14d');
      
      // Restore original environment
      if (originalEnv) {
        process.env.JWT_REFRESH_EXPIRES_IN = originalEnv;
      } else {
        delete process.env.JWT_REFRESH_EXPIRES_IN;
      }
    });
  });

  describe('swaggerConfig', () => {
    it('should return swagger configuration', () => {
      const config = swaggerConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('swagger');
      expect(config.swagger).toHaveProperty('title');
      expect(config.swagger).toHaveProperty('description');
      expect(config.swagger).toHaveProperty('version');
    });

    it('should use SWAGGER_TITLE environment variable', () => {
      const originalEnv = process.env.SWAGGER_TITLE;
      process.env.SWAGGER_TITLE = 'Custom API Title';
      
      const config = swaggerConfig();
      expect(config.swagger.title).toBe('Custom API Title');
      
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
      expect(config.swagger.description).toBe('Custom API Description');
      
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
      expect(config.swagger.version).toBe('2.0.0');
      
      // Restore original environment
      if (originalEnv) {
        process.env.SWAGGER_VERSION = originalEnv;
      } else {
        delete process.env.SWAGGER_VERSION;
      }
    });
  });

  describe('mailerConfig', () => {
    it('should return mailer configuration', () => {
      const config = mailerConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('mailer');
      expect(config.mailer).toHaveProperty('host');
      expect(config.mailer).toHaveProperty('port');
      expect(config.mailer).toHaveProperty('secure');
      expect(config.mailer).toHaveProperty('user');
      expect(config.mailer).toHaveProperty('pass');
      expect(config.mailer).toHaveProperty('from');
    });

    it('should use MAILER_HOST environment variable', () => {
      const originalEnv = process.env.MAILER_HOST;
      process.env.MAILER_HOST = 'smtp.custom.com';
      
      const config = mailerConfig();
      expect(config.mailer.host).toBe('smtp.custom.com');
      
      // Restore original environment
      if (originalEnv) {
        process.env.MAILER_HOST = originalEnv;
      } else {
        delete process.env.MAILER_HOST;
      }
    });

    it('should use MAILER_PORT environment variable', () => {
      const originalEnv = process.env.MAILER_PORT;
      process.env.MAILER_PORT = '465';
      
      const config = mailerConfig();
      expect(config.mailer.port).toBe(465);
      
      // Restore original environment
      if (originalEnv) {
        process.env.MAILER_PORT = originalEnv;
      } else {
        delete process.env.MAILER_PORT;
      }
    });

    it('should use MAILER_SECURE environment variable', () => {
      const originalEnv = process.env.MAILER_SECURE;
      process.env.MAILER_SECURE = 'true';
      
      const config = mailerConfig();
      expect(config.mailer.secure).toBe(true);
      
      // Restore original environment
      if (originalEnv) {
        process.env.MAILER_SECURE = originalEnv;
      } else {
        delete process.env.MAILER_SECURE;
      }
    });

    it('should use MAILER_USER environment variable', () => {
      const originalEnv = process.env.MAILER_USER;
      process.env.MAILER_USER = 'custom@custom.com';
      
      const config = mailerConfig();
      expect(config.mailer.user).toBe('custom@custom.com');
      
      // Restore original environment
      if (originalEnv) {
        process.env.MAILER_USER = originalEnv;
      } else {
        delete process.env.MAILER_USER;
      }
    });

    it('should use MAILER_PASS environment variable', () => {
      const originalEnv = process.env.MAILER_PASS;
      process.env.MAILER_PASS = 'custom-password';
      
      const config = mailerConfig();
      expect(config.mailer.pass).toBe('custom-password');
      
      // Restore original environment
      if (originalEnv) {
        process.env.MAILER_PASS = originalEnv;
      } else {
        delete process.env.MAILER_PASS;
      }
    });

    it('should use MAILER_FROM environment variable', () => {
      const originalEnv = process.env.MAILER_FROM;
      process.env.MAILER_FROM = 'noreply@custom.com';
      
      const config = mailerConfig();
      expect(config.mailer.from).toBe('noreply@custom.com');
      
      // Restore original environment
      if (originalEnv) {
        process.env.MAILER_FROM = originalEnv;
      } else {
        delete process.env.MAILER_FROM;
      }
    });
  });
});
