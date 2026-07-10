import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtIgnoreExpirationStrategy } from './strategies/jwt-ignore-expiration.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { TmsModule } from '../tms/tms.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
	imports: [
		PrismaModule,
		TmsModule,
		NotificationsModule,
		PassportModule,
		ThrottlerModule.forRoot([
			{
				ttl: 60000,
				limit: 10,
			},
		]),
		JwtModule.registerAsync({
			useFactory: (configService: ConfigService) => ({
				secret: configService.get('JWT_SECRET'),
				signOptions: {
					expiresIn: configService.get('JWT_EXPIRES_IN') || '15m',
				},
			}),
			inject: [ConfigService],
		}),
	],
	controllers: [AuthController],
	providers: [AuthService, JwtStrategy, JwtIgnoreExpirationStrategy, LocalStrategy],
	exports: [AuthService],
})
export class AuthModule {}
