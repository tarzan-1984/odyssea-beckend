import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';

// Mock nodemailer
jest.mock('nodemailer');

describe('MailerService Integration', () => {
  let mailerService: MailerService;
  let authService: AuthService;
  let mockTransporter: any;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    otpCode: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        AuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    mailerService = module.get<MailerService>(MailerService);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('OTP Email Integration', () => {
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
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
      };
      (nodemailer.createTransport as jest.Mock).mockReturnValue(
        mockTransporter,
      );
    });

    it('should send OTP email when loginWithOtp is called', async () => {
      // Setup mock user with properly hashed password
      const hashedPassword = await bcrypt.hash('password123', 12);
      const mockUser = {
        id: '1',
        email: 'user@example.com',
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Doe',
        role: 'DRIVER',
        status: 'ACTIVE',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.otpCode.create.mockResolvedValue({ id: '1' });

      // Initialize mailer service
      await mailerService.onModuleInit();

      // Call loginWithOtp which should trigger email sending
      const result = await authService.loginWithOtp(
        'user@example.com',
        'password123',
      );

      expect(result.message).toBe('OTP code sent to your email');
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });
  });

  describe('Password Reset Email Integration', () => {
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
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
      };
      (nodemailer.createTransport as jest.Mock).mockReturnValue(
        mockTransporter,
      );
    });

    it('should send password reset email when forgotPassword is called', async () => {
      // Setup mock user
      const mockUser = {
        id: '1',
        email: 'user@example.com',
        password: 'hashedPassword',
        firstName: 'John',
        lastName: 'Doe',
        role: 'DRIVER',
        status: 'ACTIVE',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.passwordResetToken.deleteMany.mockResolvedValue({});
      mockPrismaService.passwordResetToken.create.mockResolvedValue({
        id: '1',
      });

      // Initialize mailer service
      await mailerService.onModuleInit();

      // Call forgotPassword which should trigger email sending
      await authService.forgotPassword('user@example.com');

      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });
  });
});
