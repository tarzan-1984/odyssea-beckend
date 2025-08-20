import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailLoginDto } from './dto/email-login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserRole, UserStatus } from '@prisma/client';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    loginWithOtp: jest.fn(),
    verifyOtp: jest.fn(),
    socialLogin: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
  };

  const mockUser = {
    id: '1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.DRIVER,
    status: UserStatus.ACTIVE,
  };

  const mockAuthResponse = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: mockUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    const loginDto: EmailLoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should send OTP code successfully', async () => {
      const expectedResponse = { message: 'OTP code sent to your email' };
      mockAuthService.loginWithOtp.mockResolvedValue(expectedResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResponse);
      expect(authService.loginWithOtp).toHaveBeenCalledWith(
        loginDto.email,
        loginDto.password,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.loginWithOtp.mockRejectedValue(error);

      await expect(controller.login(loginDto)).rejects.toThrow(error);
    });
  });

  describe('verifyOtp', () => {
    const verifyOtpDto: VerifyOtpDto = {
      email: 'test@example.com',
      otp: '123456',
    };

    it('should verify OTP and return auth response successfully', async () => {
      mockAuthService.verifyOtp.mockResolvedValue(mockAuthResponse);

      const result = await controller.verifyOtp(verifyOtpDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.verifyOtp).toHaveBeenCalledWith(
        verifyOtpDto.email,
        verifyOtpDto.otp,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.verifyOtp.mockRejectedValue(error);

      await expect(controller.verifyOtp(verifyOtpDto)).rejects.toThrow(error);
    });
  });

  describe('socialLogin', () => {
    const socialLoginDto: SocialLoginDto = {
      provider: 'GOOGLE',
      accessToken: 'google-token',
    };

    it('should authenticate user via social provider successfully', async () => {
      mockAuthService.socialLogin.mockResolvedValue(mockAuthResponse);

      const result = await controller.socialLogin(socialLoginDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.socialLogin).toHaveBeenCalledWith(
        socialLoginDto.provider,
        socialLoginDto.accessToken,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.socialLogin.mockRejectedValue(error);

      await expect(controller.socialLogin(socialLoginDto)).rejects.toThrow(error);
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordDto: ForgotPasswordDto = {
      email: 'test@example.com',
    };

    it('should send password reset email successfully', async () => {
      mockAuthService.forgotPassword.mockResolvedValue(undefined);

      const result = await controller.forgotPassword(forgotPasswordDto);

      expect(result).toEqual({
        message:
          'If an account with this email exists, a password reset link has been sent.',
      });
      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto.email,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.forgotPassword.mockRejectedValue(error);

      await expect(controller.forgotPassword(forgotPasswordDto)).rejects.toThrow(
        error,
      );
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto: ResetPasswordDto = {
      token: 'reset-token',
      newPassword: 'newpassword123',
    };

    it('should reset password successfully', async () => {
      mockAuthService.resetPassword.mockResolvedValue(undefined);

      const result = await controller.resetPassword(resetPasswordDto);

      expect(result).toEqual({ message: 'Password successfully reset' });
      expect(authService.resetPassword).toHaveBeenCalledWith(
        resetPasswordDto.token,
        resetPasswordDto.newPassword,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.resetPassword.mockRejectedValue(error);

      await expect(controller.resetPassword(resetPasswordDto)).rejects.toThrow(
        error,
      );
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto: RefreshTokenDto = {
      refreshToken: 'refresh-token',
    };

    it('should refresh access token successfully', async () => {
      const expectedResponse = { accessToken: 'new-access-token' };
      mockAuthService.refreshToken.mockResolvedValue(expectedResponse);

      const result = await controller.refreshToken(refreshTokenDto);

      expect(result).toEqual(expectedResponse);
      expect(authService.refreshToken).toHaveBeenCalledWith(
        refreshTokenDto.refreshToken,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.refreshToken.mockRejectedValue(error);

      await expect(controller.refreshToken(refreshTokenDto)).rejects.toThrow(
        error,
      );
    });
  });

  describe('logout', () => {
    const refreshTokenDto: RefreshTokenDto = {
      refreshToken: 'refresh-token',
    };

    it('should logout user successfully', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(refreshTokenDto);

      expect(result).toEqual({ message: 'Successfully logged out' });
      expect(authService.logout).toHaveBeenCalledWith(
        refreshTokenDto.refreshToken,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.logout.mockRejectedValue(error);

      await expect(controller.logout(refreshTokenDto)).rejects.toThrow(error);
    });
  });
});
