import { validate } from 'class-validator';
import { EmailLoginDto } from './email-login.dto';
import { VerifyOtpDto } from './verify-otp.dto';
import { SocialLoginDto } from './social-login.dto';
import { ForgotPasswordDto } from './forgot-password.dto';
import { ResetPasswordDto } from './reset-password.dto';
import { RefreshTokenDto } from './refresh-token.dto';
import { SocialProvider } from './social-login.dto';

describe('Auth DTOs', () => {
	describe('EmailLoginDto', () => {
		it('should validate valid email login data', async () => {
			const dto = new EmailLoginDto();
			dto.email = 'test@example.com';
			dto.password = 'password123';

			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('should fail validation for invalid email', async () => {
			const dto = new EmailLoginDto();
			dto.email = 'invalid-email';
			dto.password = 'password123';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.isEmail).toBeDefined();
		});

		it('should fail validation for empty password', async () => {
			const dto = new EmailLoginDto();
			dto.email = 'test@example.com';
			dto.password = '';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.minLength).toBeDefined();
		});

		it('should fail validation for short password', async () => {
			const dto = new EmailLoginDto();
			dto.email = 'test@example.com';
			dto.password = '123';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.minLength).toBeDefined();
		});
	});

	describe('VerifyOtpDto', () => {
		it('should validate valid OTP data', async () => {
			const dto = new VerifyOtpDto();
			dto.email = 'test@example.com';
			dto.otp = '123456';

			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('should fail validation for invalid email', async () => {
			const dto = new VerifyOtpDto();
			dto.email = 'invalid-email';
			dto.otp = '123456';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.isEmail).toBeDefined();
		});

		it('should fail validation for empty OTP', async () => {
			const dto = new VerifyOtpDto();
			dto.email = 'test@example.com';
			dto.otp = '';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.isNotEmpty).toBeDefined();
		});
	});

	describe('SocialLoginDto', () => {
		it('should validate valid social login data', async () => {
			const dto = new SocialLoginDto();
			dto.provider = SocialProvider.GOOGLE;
			dto.accessToken = 'google-access-token';

			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('should fail validation for invalid provider', async () => {
			const dto = new SocialLoginDto();
			dto.provider = 'INVALID_PROVIDER' as SocialProvider;
			dto.accessToken = 'google-access-token';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.isEnum).toBeDefined();
		});

		it('should fail validation for empty access token', async () => {
			const dto = new SocialLoginDto();
			dto.provider = SocialProvider.GOOGLE;
			dto.accessToken = '';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.isNotEmpty).toBeDefined();
		});
	});

	describe('ForgotPasswordDto', () => {
		it('should validate valid forgot password data', async () => {
			const dto = new ForgotPasswordDto();
			dto.email = 'test@example.com';

			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('should fail validation for invalid email', async () => {
			const dto = new ForgotPasswordDto();
			dto.email = 'invalid-email';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.isEmail).toBeDefined();
		});
	});

	describe('ResetPasswordDto', () => {
		it('should validate valid reset password data', async () => {
			const dto = new ResetPasswordDto();
			dto.token = 'reset-token';
			dto.newPassword = 'newpassword123';

			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('should fail validation for empty token', async () => {
			const dto = new ResetPasswordDto();
			dto.token = '';
			dto.newPassword = 'newpassword123';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.isNotEmpty).toBeDefined();
		});

		it('should fail validation for short password', async () => {
			const dto = new ResetPasswordDto();
			dto.token = 'reset-token';
			dto.newPassword = '123';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.minLength).toBeDefined();
		});
	});

	describe('RefreshTokenDto', () => {
		it('should validate valid refresh token data', async () => {
			const dto = new RefreshTokenDto();
			dto.refreshToken = 'refresh-token';

			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('should fail validation for empty refresh token', async () => {
			const dto = new RefreshTokenDto();
			dto.refreshToken = '';

			const errors = await validate(dto);
			expect(errors).toHaveLength(1);
			expect(errors[0].constraints?.isNotEmpty).toBeDefined();
		});
	});
});
