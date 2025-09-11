import {
	Controller,
	Post,
	Body,
	UseGuards,
	HttpCode,
	HttpStatus,
	Get,
	Query,
	Res,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { encryption } from '../helpers/helper';
import { StateData } from '../types/request.types';

import { AuthService, AuthResponse } from './auth.service';
import { EmailLoginDto } from './dto/email-login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	@Throttle({ default: { ttl: 300000, limit: 5 } })
	@ApiOperation({ summary: 'User login with email and password' })
	@ApiResponse({
		status: 200,
		description: 'OTP code sent to email',
		schema: {
			type: 'object',
			properties: {
				message: { type: 'string' },
			},
		},
	})
	@ApiResponse({
		status: 401,
		description: 'Invalid credentials or insufficient permissions',
	})
	async login(@Body() loginDto: EmailLoginDto): Promise<{ message: string }> {
		try {
			return await this.authService.loginWithOtp(
				loginDto.email,
				loginDto.password,
			);
		} catch (error) {
			if (error instanceof UnauthorizedException) {
				throw error;
			}
			throw new UnauthorizedException('Invalid credentials');
		}
	}

	@Post('verify-otp')
	@HttpCode(HttpStatus.OK)
	@Throttle({ default: { ttl: 300000, limit: 5 } })
	@ApiOperation({ summary: 'Verify OTP code and complete login' })
	@ApiResponse({
		status: 200,
		description: 'User successfully logged in',
		schema: {
			type: 'object',
			properties: {
				accessToken: { type: 'string' },
				refreshToken: { type: 'string' },
				user: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						email: { type: 'string' },
						firstName: { type: 'string' },
						lastName: { type: 'string' },
						role: { type: 'string' },
						status: { type: 'string' },
					},
				},
			},
		},
	})
	@ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
	async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<AuthResponse> {
		return this.authService.verifyOtp(verifyOtpDto.email, verifyOtpDto.otp);
	}

	@Get('social-login')
	@ApiOperation({ summary: 'Initiate Google OAuth flow' })
	@ApiQuery({
		name: 'frontendUrl',
		required: false,
		description:
			'Frontend URL for redirect after authentication (for dev mode)',
		type: String,
	})
	@ApiResponse({
		status: 302,
		description: 'Redirects the user to the Google OAuth consent screen',
	})
	googleAuth(
		@Res() res: Response,
		@Query('frontendUrl') frontendUrl?: string,
	) {
		// Use provided frontendUrl or fallback to environment variable
		const targetFrontendUrl = frontendUrl || process.env.FRONTEND_URL;

		const state = encodeURIComponent(
			JSON.stringify({
				frontendUrl: targetFrontendUrl,
			}),
		);

		const clientId = process.env.GOOGLE_CLIENT_ID;
		const redirectUri = process.env.GOOGLE_CALLBACK_URL;
		const scope = ['email', 'profile'].join(' ');

		const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${state}`;

		console.log('authUrl', authUrl);
		console.log('frontendUrl from query:', frontendUrl);
		console.log('targetFrontendUrl:', targetFrontendUrl);

		return res.redirect(authUrl);
	}

	@Get('google/callback')
	@ApiOperation({
		summary: 'Handles Google OAuth callback after user consent',
	})
	@ApiQuery({
		name: 'code',
		required: true,
		description:
			'OAuth 2.0 authorization code returned from Google after user grants access',
		type: String,
	})
	@ApiQuery({
		name: 'state',
		required: false,
		description:
			'Encoded state passed during initial OAuth request, may contain userId',
		type: String,
	})
	@ApiResponse({
		status: 302,
		description:
			'Redirects user to frontend with encrypted user data in payload query param',
	})
	@ApiResponse({
		status: 500,
		description:
			'Failed to exchange code for token or internal error occurred',
	})
	async googleCallback(
		@Query('code') code: string,
		@Res() res: Response,
		@Query('state') state?: string,
	) {
		// Helper function to ensure proper URL formatting
		const formatUrl = (baseUrl: string, path: string) => {
			const cleanBase = baseUrl.replace(/\/$/, ''); // Remove trailing slash
			const cleanPath = path.replace(/^\//, ''); // Remove leading slash
			return `${cleanBase}/${cleanPath}`;
		};

		try {
			// Extract frontendUrl from state parameter or use environment variable as fallback
			let frontendUrl =
				process.env.FRONTEND_URL || 'http://localhost:3000';

			if (state) {
				try {
					const stateData = JSON.parse(
						decodeURIComponent(state),
					) as StateData;
					if (stateData.frontendUrl) {
						frontendUrl = stateData.frontendUrl;
					}
				} catch (error) {
					console.warn(
						'Failed to parse state parameter, using default frontend URL:',
						error,
					);
				}
			}

			console.log('Using frontend URL for redirect:', frontendUrl);

			const result = await this.authService.handleGoogleCallback(code);

			// Check if user has permission to access the system
			if (result.user.role.toLowerCase() === 'driver') {
				const errorMessage =
					'You do not have permission to access this system. Users with your role cannot log in.';
				return res.redirect(
					formatUrl(
						frontendUrl,
						`signin?error=${encodeURIComponent(errorMessage)}`,
					),
				);
			}

			const payloadToEncrypt = {
				accessToken: result.accessToken,
				refreshToken: result.refreshToken,
				user: {
					id: result.user.id,
					email: result.user.email,
					firstName: result.user.firstName,
					lastName: result.user.lastName,
					role: result.user.role,
					status: result.user.status,
					avatar: result.user.avatar,
				},
			};

			const encryptedPayload = encryption(payloadToEncrypt);

			if (!encryptedPayload) {
				throw new Error('Failed to encrypt payload');
			}

			return res.redirect(
				formatUrl(
					frontendUrl,
					`auth-success?payload=${encodeURIComponent(encryptedPayload)}`,
				),
			);
		} catch {
			// Extract frontendUrl from state parameter for error redirect as well
			let frontendUrl =
				process.env.FRONTEND_URL || 'http://localhost:3000';

			if (state) {
				try {
					const stateData = JSON.parse(
						decodeURIComponent(state),
					) as StateData;
					if (stateData.frontendUrl) {
						frontendUrl = stateData.frontendUrl;
					}
				} catch (error) {
					console.warn(
						'Failed to parse state parameter in error handler, using default frontend URL:',
						error,
					);
				}
			}

			const errorMessage = 'You are not registered in the system';
			return res.redirect(
				formatUrl(
					frontendUrl,
					`signin?error=${encodeURIComponent(errorMessage)}`,
				),
			);
		}
	}

	@Post('forgot-password')
	@HttpCode(HttpStatus.OK)
	@Throttle({ default: { ttl: 300000, limit: 3 } })
	@ApiOperation({ summary: 'Request password reset' })
	@ApiResponse({
		status: 200,
		description: 'Password reset email sent (if user exists)',
	})
	async forgotPassword(
		@Body() forgotPasswordDto: ForgotPasswordDto,
	): Promise<{ message: string }> {
		await this.authService.forgotPassword(forgotPasswordDto.email);
		return {
			message:
				'If an account with this email exists, a password reset link has been sent.',
		};
	}

	@Post('reset-password')
	@HttpCode(HttpStatus.OK)
	@Throttle({ default: { ttl: 300000, limit: 3 } })
	@ApiOperation({ summary: 'Reset password using token' })
	@ApiResponse({
		status: 200,
		description: 'Password successfully reset',
	})
	@ApiResponse({ status: 400, description: 'Invalid or expired token' })
	async resetPassword(
		@Body() resetPasswordDto: ResetPasswordDto,
	): Promise<{ message: string }> {
		await this.authService.resetPassword(
			resetPasswordDto.token,
			resetPasswordDto.newPassword,
		);
		return { message: 'Password successfully reset' };
	}

	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Refresh access token' })
	@ApiResponse({
		status: 200,
		description: 'Access token refreshed',
		schema: {
			type: 'object',
			properties: {
				accessToken: { type: 'string' },
			},
		},
	})
	@ApiResponse({ status: 401, description: 'Invalid refresh token' })
	async refreshToken(
		@Body() refreshTokenDto: RefreshTokenDto,
	): Promise<{ accessToken: string }> {
		return this.authService.refreshToken(refreshTokenDto.refreshToken);
	}

	@Post('logout')
	@UseGuards(AuthGuard('jwt'))
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Logout user' })
	@ApiResponse({
		status: 200,
		description: 'User successfully logged out',
	})
	async logout(
		@Body() refreshTokenDto: RefreshTokenDto,
	): Promise<{ message: string }> {
		await this.authService.logout(refreshTokenDto.refreshToken);
		return { message: 'Successfully logged out' };
	}
}
