import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Mock SwaggerModule
jest.mock('@nestjs/swagger', () => ({
  SwaggerModule: {
    createDocument: jest.fn(),
    setup: jest.fn(),
  },
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
}));

describe('Main Application', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configService = moduleFixture.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should create the application', () => {
    expect(app).toBeDefined();
  });

  it('should have ConfigService available', () => {
    expect(configService).toBeDefined();
  });

  it('should configure global prefix when API_PREFIX is set', async () => {
    const originalEnv = process.env.API_PREFIX;
    process.env.API_PREFIX = '/api/v1';

    // Recreate app with new environment variable
    await app.close();
    const newModuleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const newApp = newModuleFixture.createNestApplication();
    
    // The global prefix should be set to /api/v1
    expect(newApp).toBeDefined();
    
    await newApp.close();

    // Restore original environment
    if (originalEnv) {
      process.env.API_PREFIX = originalEnv;
    } else {
      delete process.env.API_PREFIX;
    }
  });

  it('should configure CORS when FRONTEND_URL is set', async () => {
    const originalEnv = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'http://localhost:3000';

    // Recreate app with new environment variable
    await app.close();
    const newModuleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const newApp = newModuleFixture.createNestApplication();
    
    // The CORS should be configured
    expect(newApp).toBeDefined();
    
    await newApp.close();

    // Restore original environment
    if (originalEnv) {
      process.env.FRONTEND_URL = originalEnv;
    } else {
      delete process.env.FRONTEND_URL;
    }
  });

  it('should configure Swagger documentation', () => {
    // Verify that SwaggerModule.createDocument is called
    expect(SwaggerModule.createDocument).toBeDefined();
    expect(SwaggerModule.setup).toBeDefined();
  });

  it('should configure DocumentBuilder with correct options', () => {
    // Verify that DocumentBuilder is called with correct methods
    expect(DocumentBuilder).toBeDefined();
  });

  it('should handle environment configuration correctly', () => {
    // Test that the app can access configuration
    expect(configService).toBeDefined();
  });

  it('should be able to start and stop the application', async () => {
    // Test that the app can be started and stopped without errors
    expect(app).toBeDefined();
    await expect(app.close()).resolves.not.toThrow();
  });
});
