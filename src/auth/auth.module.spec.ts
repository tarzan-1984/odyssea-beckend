import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

describe('AuthModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              jwt: {
                secret: 'test-secret',
                expiresIn: '1h',
                refreshExpiresIn: '7d',
              },
            }),
          ],
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            secret: configService.get('jwt.secret'),
            signOptions: {
              expiresIn: configService.get('jwt.expiresIn'),
            },
          }),
          inject: [ConfigService],
        }),
        PassportModule,
      ],
      providers: [
        AuthService,
        JwtStrategy,
        LocalStrategy,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), update: jest.fn() },
            otpCode: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
            refreshToken: { create: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
            passwordResetToken: { deleteMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        {
          provide: MailerService,
          useValue: {
            sendHtmlEmail: jest.fn(),
            sendTextEmail: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
      controllers: [AuthController],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide AuthService', () => {
    const authService = module.get<AuthService>(AuthService);
    expect(authService).toBeDefined();
  });

  it('should provide AuthController', () => {
    const authController = module.get<AuthController>(AuthController);
    expect(authController).toBeDefined();
  });

  it('should provide JwtStrategy', () => {
    const jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    expect(jwtStrategy).toBeDefined();
  });

  it('should provide LocalStrategy', () => {
    const localStrategy = module.get<LocalStrategy>(LocalStrategy);
    expect(localStrategy).toBeDefined();
  });

  it('should provide PrismaService', () => {
    const prismaService = module.get<PrismaService>(PrismaService);
    expect(prismaService).toBeDefined();
  });

  it('should provide MailerService', () => {
    const mailerService = module.get<MailerService>(MailerService);
    expect(mailerService).toBeDefined();
  });

  it('should provide ConfigService', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService).toBeDefined();
  });

  it('should configure JWT module correctly', () => {
    const jwtModule = module.get(JwtModule);
    expect(jwtModule).toBeDefined();
  });

  it('should configure Passport module correctly', () => {
    const passportModule = module.get(PassportModule);
    expect(passportModule).toBeDefined();
  });

  it('should have all required dependencies injected', () => {
    const authService = module.get<AuthService>(AuthService);
    const authController = module.get<AuthController>(AuthController);
    const jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    const localStrategy = module.get<LocalStrategy>(LocalStrategy);

    // Verify that services can be instantiated without errors
    expect(authService).toBeDefined();
    expect(authController).toBeDefined();
    expect(jwtStrategy).toBeDefined();
    expect(localStrategy).toBeDefined();
  });
});
