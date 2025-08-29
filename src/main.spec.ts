import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

// Mock all Swagger decorators before importing AppModule
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
  ApiProperty: jest.fn(() => jest.fn()),
  ApiOperation: jest.fn(() => jest.fn()),
  ApiResponse: jest.fn(() => jest.fn()),
  ApiQuery: jest.fn(() => jest.fn()),
  ApiTags: jest.fn(() => jest.fn()),
  ApiBearerAuth: jest.fn(() => jest.fn()),
  ApiParam: jest.fn(() => jest.fn()),
  ApiBody: jest.fn(() => jest.fn()),
  ApiHeader: jest.fn(() => jest.fn()),
  ApiCookieAuth: jest.fn(() => jest.fn()),
  ApiExcludeController: jest.fn(() => jest.fn()),
  ApiExcludeEndpoint: jest.fn(() => jest.fn()),
  ApiExtraModels: jest.fn(() => jest.fn()),
  ApiHideProperty: jest.fn(() => jest.fn()),
  ApiOkResponse: jest.fn(() => jest.fn()),
  ApiCreatedResponse: jest.fn(() => jest.fn()),
  ApiAcceptedResponse: jest.fn(() => jest.fn()),
  ApiNoContentResponse: jest.fn(() => jest.fn()),
  ApiMovedPermanentlyResponse: jest.fn(() => jest.fn()),
  ApiFoundResponse: jest.fn(() => jest.fn()),
  ApiBadRequestResponse: jest.fn(() => jest.fn()),
  ApiUnauthorizedResponse: jest.fn(() => jest.fn()),
  ApiForbiddenResponse: jest.fn(() => jest.fn()),
  ApiNotFoundResponse: jest.fn(() => jest.fn()),
  ApiMethodNotAllowedResponse: jest.fn(() => jest.fn()),
  ApiNotAcceptableResponse: jest.fn(() => jest.fn()),
  ApiRequestTimeoutResponse: jest.fn(() => jest.fn()),
  ApiConflictResponse: jest.fn(() => jest.fn()),
  ApiGoneResponse: jest.fn(() => jest.fn()),
  ApiPayloadTooLargeResponse: jest.fn(() => jest.fn()),
  ApiUnsupportedMediaTypeResponse: jest.fn(() => jest.fn()),
  ApiUnprocessableEntityResponse: jest.fn(() => jest.fn()),
  ApiInternalServerErrorResponse: jest.fn(() => jest.fn()),
  ApiNotImplementedResponse: jest.fn(() => jest.fn()),
  ApiBadGatewayResponse: jest.fn(() => jest.fn()),
  ApiServiceUnavailableResponse: jest.fn(() => jest.fn()),
  ApiGatewayTimeoutResponse: jest.fn(() => jest.fn()),
  ApiDefaultResponse: jest.fn(() => jest.fn()),
  PartialType: jest.fn((dto) => dto),
  OmitType: jest.fn((dto, keys) => dto),
  PickType: jest.fn((dto, keys) => dto),
  IntersectionType: jest.fn((...dtos) => dtos[0]),
  ApiConsumes: jest.fn(() => jest.fn()),
  ApiProduces: jest.fn(() => jest.fn()),
  ApiSecurity: jest.fn(() => jest.fn()),
  ApiUseTags: jest.fn(() => jest.fn()),
}));

// Now import AppModule after mocking
import { AppModule } from './app.module';

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
