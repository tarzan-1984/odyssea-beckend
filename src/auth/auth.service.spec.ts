/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { UserRole, UserStatus } from '@prisma/client';
import { SocialProvider } from './dto/social-login.dto';
import { ConfigService } from '@nestjs/config';

describe('AuthService', () => {
  let service: AuthService;
  let configService: ConfigService;

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
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockMailerService = {
    sendHtmlEmail: jest.fn(),
    sendTextEmail: jest.fn().mockResolvedValue(true),
    sendMail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'jwt.secret': 'test-secret',
                'jwt.expiresIn': '1h',
                'jwt.refreshExpiresIn': '7d',
                'mailer.from': 'noreply@example.com',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset mocks
    jest.clearAllMocks();

    // Ensure MailerService mock returns true
    mockMailerService.sendTextEmail.mockResolvedValue(true);
    mockMailerService.sendHtmlEmail.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    let mockUser: {
      id: string;
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: UserRole;
      status: UserStatus;
    };

    beforeEach(async () => {
      mockUser = {
        id: '1',
        email: 'test@example.com',
        password: await bcrypt.hash('password123', 12),
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.ADMINISTRATOR,
        status: UserStatus.ACTIVE,
      };
    });

    it('should validate user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      mockPrismaService.user.findUnique.mockResolvedValue(inactiveUser);

      await expect(
        service.validateUser('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('loginWithOtp', () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      password: 'hashedPassword',
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
    };

    it('should send OTP code successfully', async () => {
      // Create a properly hashed password for the test
      const hashedPassword = await bcrypt.hash('password123', 12);
      const userWithHashedPassword = { ...mockUser, password: hashedPassword };

      mockPrismaService.user.findUnique.mockResolvedValue(
        userWithHashedPassword,
      );
      mockPrismaService.otpCode.create.mockResolvedValue({
        id: '1',
        code: '123456',
        email: 'test@example.com',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // Mock MailerService to return true
      mockMailerService.sendTextEmail.mockResolvedValue(true);

      const result = await service.loginWithOtp(
        'test@example.com',
        'password123',
      );

      expect(result).toEqual({
        message: 'OTP code sent to your email',
      });
      expect(mockPrismaService.otpCode.create).toHaveBeenCalled();
      expect(mockMailerService.sendHtmlEmail).toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      password: 'hashedPassword',
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
    };

    const mockOtpRecord = {
      id: '1',
      email: 'test@example.com',
      code: '123456',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      isUsed: false,
    };

    it('should verify OTP and return tokens successfully', async () => {
      (
        mockPrismaService.otpCode.findFirst as jest.MockedFunction<any>
      ).mockResolvedValue(mockOtpRecord);
      (
        mockPrismaService.otpCode.update as jest.MockedFunction<any>
      ).mockResolvedValue(mockOtpRecord);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('jwt-token');
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      // Mock the generateRefreshToken method
      jest
        .spyOn(service as any, 'generateRefreshToken')
        .mockResolvedValue('refresh-token');

      const result = await service.verifyOtp('test@example.com', '123456');

      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
        status: mockUser.status,
        avatar: '',
      });
    });

    it('should throw BadRequestException for invalid OTP', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp('test@example.com', '123456'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('socialLogin', () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      password: 'hashedPassword',
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
    };

    it('should authenticate user via Google successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('jwt-token');
      mockPrismaService.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      // Mock the generateRefreshToken method
      jest
        .spyOn(service as any, 'generateRefreshToken')
        .mockResolvedValue('refresh-token');

      const result = await service.socialLogin(
        SocialProvider.GOOGLE,
        'google-token',
      );

      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
        status: mockUser.status,
        avatar: '',
      });
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.socialLogin(SocialProvider.GOOGLE, 'google-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
    };

    it('should create password reset token successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.passwordResetToken.deleteMany.mockResolvedValue({});
      mockPrismaService.passwordResetToken.create.mockResolvedValue({
        token: 'reset-token',
      });

      // Mock ConfigService to return app config
      (configService.get as jest.Mock).mockReturnValue({
        frontendUrl: 'http://localhost:3000',
      });

      // Mock MailerService to return true
      mockMailerService.sendHtmlEmail.mockResolvedValue(true);

      await service.forgotPassword('test@example.com');

      expect(
        mockPrismaService.passwordResetToken.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: '1' },
      });
      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledWith({
        data: {
          token: expect.any(String),
          userId: '1',
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should not create token for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword('nonexistent@example.com');

      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const mockResetToken = {
      id: '1',
      token: 'reset-token',
      userId: '1',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
      user: {
        id: '1',
        email: 'test@example.com',
      },
    };

    it('should reset password successfully', async () => {
      (
        mockPrismaService.passwordResetToken
          .findUnique as jest.MockedFunction<any>
      ).mockResolvedValue(mockResetToken);
      (
        mockPrismaService.$transaction as jest.MockedFunction<any>
      ).mockResolvedValue([{}, {}]);

      await service.resetPassword('reset-token', 'newpassword123');

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid-token', 'newpassword123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('logout', () => {
    it('should delete refresh token successfully', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({});

      await service.logout('refresh-token');

      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'refresh-token' },
      });
    });
  });
});
