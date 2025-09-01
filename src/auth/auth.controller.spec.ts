import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailLoginDto } from './dto/email-login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserRole, UserStatus } from '@prisma/client';

// Mock the encryption helper
jest.mock('../helpers/helper', () => ({
  encryption: jest.fn().mockReturnValue('encrypted-payload'),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: jest.Mocked<AuthService>;

  const mockUser = {
    id: '1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.ADMINISTRATOR,
    status: UserStatus.ACTIVE,
    avatar: 'avatar.jpg',
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
          useValue: {
            loginWithOtp: jest.fn(),
            verifyOtp: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            refreshToken: jest.fn(),
            logout: jest.fn(),
            handleGoogleCallback: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    mockAuthService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    const loginDto: EmailLoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should authenticate user successfully', async () => {
      mockAuthService.loginWithOtp.mockResolvedValue({ message: 'OTP sent' });

      const result = await controller.login(loginDto);

      expect(result).toEqual({ message: 'OTP sent' });
      expect(mockAuthService.loginWithOtp).toHaveBeenCalledWith(
        loginDto.email,
        loginDto.password,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.loginWithOtp.mockRejectedValue(error);

      await expect(controller.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('verifyOtp', () => {
    const verifyOtpDto: VerifyOtpDto = {
      email: 'test@example.com',
      otp: '123456',
    };

    it('should verify OTP successfully', async () => {
      mockAuthService.verifyOtp.mockResolvedValue(mockAuthResponse);

      const result = await controller.verifyOtp(verifyOtpDto);

      expect(result).toEqual(mockAuthResponse);
      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(
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
      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto.email,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.forgotPassword.mockRejectedValue(error);

      await expect(
        controller.forgotPassword(forgotPasswordDto),
      ).rejects.toThrow(error);
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
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
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

    it('should refresh token successfully', async () => {
      mockAuthService.refreshToken.mockResolvedValue(mockAuthResponse);

      const result = await controller.refreshToken(refreshTokenDto);

      expect(result).toEqual(mockAuthResponse);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(
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
      expect(mockAuthService.logout).toHaveBeenCalledWith(
        refreshTokenDto.refreshToken,
      );
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuthService.logout.mockRejectedValue(error);

      await expect(controller.logout(refreshTokenDto)).rejects.toThrow(error);
    });
  });

  describe('googleAuth', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        redirect: jest.fn(),
      };
    });

    it('should redirect to Google OAuth with default frontend URL', () => {
      // Mock environment variable
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://production.example.com';

      controller.googleAuth(mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth')
      );
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('state=' + encodeURIComponent(JSON.stringify({
          frontendUrl: 'https://production.example.com'
        })))
      );

      // Restore environment variable
      process.env.FRONTEND_URL = originalFrontendUrl;
    });

    it('should redirect to Google OAuth with custom frontend URL', () => {
      const customFrontendUrl = 'http://localhost:3000';

      controller.googleAuth(mockResponse, customFrontendUrl);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth')
      );
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('state=' + encodeURIComponent(JSON.stringify({
          frontendUrl: customFrontendUrl
        })))
      );
    });

    it('should include all required OAuth parameters', () => {
      const customFrontendUrl = 'http://localhost:3000';
      
      // Mock environment variables
      const originalClientId = process.env.GOOGLE_CLIENT_ID;
      const originalCallbackUrl = process.env.GOOGLE_CALLBACK_URL;
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/auth/google/callback';

      controller.googleAuth(mockResponse, customFrontendUrl);

      const redirectUrl = mockResponse.redirect.mock.calls[0][0];
      
      expect(redirectUrl).toContain('response_type=code');
      expect(redirectUrl).toContain('client_id=test-client-id');
      expect(redirectUrl).toContain('redirect_uri=http://localhost:3000/auth/google/callback');
      expect(redirectUrl).toContain('scope=email%20profile');
      expect(redirectUrl).toContain('access_type=offline');
      expect(redirectUrl).toContain('prompt=consent');

      // Restore environment variables
      process.env.GOOGLE_CLIENT_ID = originalClientId;
      process.env.GOOGLE_CALLBACK_URL = originalCallbackUrl;
    });
  });

  describe('googleCallback', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        redirect: jest.fn(),
      };
    });

    it('should redirect to success page with custom frontend URL', async () => {
      const code = 'test-code';
      const state = encodeURIComponent(JSON.stringify({
        frontendUrl: 'http://localhost:3000'
      }));

      mockAuthService.handleGoogleCallback.mockResolvedValue(mockAuthResponse);

      await controller.googleCallback(code, mockResponse, state);

      expect(mockAuthService.handleGoogleCallback).toHaveBeenCalledWith(code);
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth-success?payload=encrypted-payload'
      );
    });

    it('should redirect to error page for driver role with custom frontend URL', async () => {
      const code = 'test-code';
      const state = encodeURIComponent(JSON.stringify({
        frontendUrl: 'http://localhost:3000'
      }));

      const driverAuthResponse = {
        ...mockAuthResponse,
        user: { ...mockAuthResponse.user, role: UserRole.DRIVER }
      };

      mockAuthService.handleGoogleCallback.mockResolvedValue(driverAuthResponse);

      await controller.googleCallback(code, mockResponse, state);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3000/signin?error=')
      );
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/signin?error=You%20do%20not%20have%20permission%20to%20access%20this%20system.%20Users%20with%20your%20role%20cannot%20log%20in.'
      );
    });

    it('should use default frontend URL when state is not provided', async () => {
      const code = 'test-code';
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://production.example.com';

      mockAuthService.handleGoogleCallback.mockResolvedValue(mockAuthResponse);

      await controller.googleCallback(code, mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'https://production.example.com/auth-success?payload=encrypted-payload'
      );

      // Restore environment variable
      process.env.FRONTEND_URL = originalFrontendUrl;
    });

    it('should use default frontend URL when state parsing fails', async () => {
      const code = 'test-code';
      const invalidState = 'invalid-json-state';
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://production.example.com';

      mockAuthService.handleGoogleCallback.mockResolvedValue(mockAuthResponse);

      await controller.googleCallback(code, mockResponse, invalidState);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'https://production.example.com/auth-success?payload=encrypted-payload'
      );

      // Restore environment variable
      process.env.FRONTEND_URL = originalFrontendUrl;
    });

    it('should handle service errors and redirect to error page with custom frontend URL', async () => {
      const code = 'test-code';
      const state = encodeURIComponent(JSON.stringify({
        frontendUrl: 'http://localhost:3000'
      }));

      mockAuthService.handleGoogleCallback.mockRejectedValue(new Error('Service error'));

      await controller.googleCallback(code, mockResponse, state);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/signin?error=' + encodeURIComponent('You are not registered in the system')
      );
    });

    it('should handle service errors and use default frontend URL when state parsing fails', async () => {
      const code = 'test-code';
      const invalidState = 'invalid-json-state';
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://production.example.com';

      mockAuthService.handleGoogleCallback.mockRejectedValue(new Error('Service error'));

      await controller.googleCallback(code, mockResponse, invalidState);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'https://production.example.com/signin?error=' + encodeURIComponent('You are not registered in the system')
      );

      // Restore environment variable
      process.env.FRONTEND_URL = originalFrontendUrl;
    });

    it('should handle empty state object gracefully', async () => {
      const code = 'test-code';
      const state = encodeURIComponent(JSON.stringify({}));
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://production.example.com';

      mockAuthService.handleGoogleCallback.mockResolvedValue(mockAuthResponse);

      await controller.googleCallback(code, mockResponse, state);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'https://production.example.com/auth-success?payload=encrypted-payload'
      );

      // Restore environment variable
      process.env.FRONTEND_URL = originalFrontendUrl;
    });
  });
});
