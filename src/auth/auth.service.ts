import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { UserRole, UserStatus } from '@prisma/client';
import { AppConfig } from '../config/env.config';
import { SocialProvider } from './dto/social-login.dto';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

interface GoogleIdToken {
  email: string;
  name: string;
  picture?: string;
  sub: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: UserStatus;
    avatar: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async handleGoogleCallback(code: string) {
    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        'https://oauth2.googleapis.com/token',
        null,
        {
          params: {
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: process.env.GOOGLE_CALLBACK_URL,
            grant_type: 'authorization_code',
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    } catch (error) {
      // Log the full error from axios, including response data if present
      console.error(
        '❌ Failed to exchange Google code for tokens:',
        error.response?.data || error.message,
      );
      throw new Error('Failed to exchange code for token 22222');
    }

    const { id_token } = tokenResponse.data;

    const decoded = jwtDecode<GoogleIdToken>(id_token);
    const userEmail = decoded.email;
    const avatar = decoded.picture;

    // Check if user exists in database
    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      throw new NotFoundException('User not found with this Google account');
    }

    // Update last login and profile photo if needed
    const updateData: { lastLoginAt: Date; profilePhoto?: string } = {
      lastLoginAt: new Date(),
    };

    // If we have avatar from Google and user doesn't have profilePhoto, update it
    if (avatar && !user.profilePhoto) {
      updateData.profilePhoto = avatar;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Generate JWT tokens
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.generateRefreshToken(user.id),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        avatar,
      },
    };
  }

  /**
   * Validates user credentials and returns user data
   */
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  /**
   * Authenticates user with email/password and sends OTP
   */
  async loginWithOtp(
    email: string,
    password: string,
  ): Promise<{ message: string }> {
    const user = await this.validateUser(email, password);

    // Generate OTP code
    const otpCode = this.generateOtpCode();

    // Save OTP to database
    await this.prisma.otpCode.create({
      data: {
        email: user.email,
        code: otpCode,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    // Send OTP via email
    const emailSent = await this.mailerService.sendHtmlEmail(
      user.email,
      'Your OTP Code',
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your OTP Code</h2>
        <p>Hello ${user.firstName},</p>
        <p>Your OTP code is: <strong style="font-size: 24px; color: #007bff;">${otpCode}</strong></p>
        <p>This code will expire in 5 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
      `,
    );

    if (!emailSent) {
      throw new BadRequestException('Failed to send OTP email');
    }

    return {
      message: 'OTP code sent to your email',
    };
  }

  /**
   * Verifies OTP and returns JWT tokens
   */
  async verifyOtp(email: string, otp: string): Promise<AuthResponse> {
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        email,
        code: otp,
        expiresAt: { gt: new Date() },
        isUsed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Mark OTP as used
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.generateRefreshToken(user.id),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        avatar: user.profilePhoto || '', // Use profilePhoto from database or empty string
      },
    };
  }

  /**
   * Authenticates user via social provider
   */
  async socialLogin(
    provider: SocialProvider,
    socialAccessToken: string,
  ): Promise<AuthResponse> {
    let userData: {
      email: string;
      firstName: string;
      lastName: string;
    };

    switch (provider) {
      case SocialProvider.GOOGLE:
        userData = this.verifyGoogleToken(socialAccessToken);
        break;
      case SocialProvider.FACEBOOK:
        userData = this.verifyFacebookToken(socialAccessToken);
        break;
      case SocialProvider.APPLE:
        userData = this.verifyAppleToken(socialAccessToken);
        break;
      default:
        throw new BadRequestException('Unsupported social provider');
    }

    // Find or create user
    const user = await this.prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (!user) {
      throw new UnauthorizedException(
        'User not found. Please contact administrator.',
      );
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [jwtAccessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.generateRefreshToken(user.id),
    ]);

    return {
      accessToken: jwtAccessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        avatar: user.profilePhoto || '', // Use profilePhoto from database or empty string
      },
    };
  }

  /**
   * Generates refresh token and stores it in database
   */
  private async generateRefreshToken(userId: string): Promise<string> {
    const token = this.generateRandomToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * Refreshes access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const payload: JwtPayload = {
      sub: tokenRecord.user.id,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }

  /**
   * Initiates password reset process
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      return;
    }

    // Delete any existing reset tokens for this user
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new reset token
    const token = this.generateRandomToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiration

    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Send email with reset link
    const appConfig = this.configService.get<AppConfig>('app');

    if (!appConfig) {
      throw new BadRequestException('Failed to get app config');
    }

    const resetUrl = `${appConfig.frontendUrl}/reset-password?token=${token}`;

    const emailSent = await this.mailerService.sendHtmlEmail(
      user.email,
      'Password Reset Request',
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${user.firstName},</p>
        <p>You have requested to reset your password. Click the button below to reset it:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this reset, please ignore this email.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
      `,
    );

    if (!emailSent) {
      throw new BadRequestException('Failed to send password reset email');
    }
  }

  /**
   * Resets password using reset token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid reset token');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Reset token has already been used');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password and mark token as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  /**
   * Logs out user by invalidating refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  /**
   * Generates random token for password reset
   */
  private generateRandomToken(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  /**
   * Generates 6-digit OTP code
   */
  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Verifies Google access token and returns user data
   */
  private verifyGoogleToken(_accessToken: string) {
    // TODO: Implement Google token verification
    // For now, return mock data
    return {
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };
  }

  /**
   * Verifies Facebook access token and returns user data
   */
  private verifyFacebookToken(_accessToken: string) {
    // TODO: Implement Facebook token verification
    return {
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };
  }

  /**
   * Verifies Apple access token and returns user data
   */
  private verifyAppleToken(_accessToken: string) {
    // TODO: Implement Apple token verification
    return {
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };
  }
}
