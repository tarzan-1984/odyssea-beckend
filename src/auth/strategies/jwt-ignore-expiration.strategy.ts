import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';
import { validateJwtUserFromPayload } from '../utils/validate-jwt-user.util';

@Injectable()
export class JwtIgnoreExpirationStrategy extends PassportStrategy(
	Strategy,
	'jwt-ignore-expiration',
) {
	constructor(
		private readonly configService: ConfigService,
		private readonly prisma: PrismaService,
	) {
		const jwtSecret = configService.get<string>('jwt.secret');
		if (!jwtSecret) {
			throw new Error(
				'JWT_SECRET is not defined in environment variables',
			);
		}

		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: true,
			secretOrKey: jwtSecret,
		});
	}

	async validate(payload: JwtPayload) {
		return validateJwtUserFromPayload(this.prisma, payload);
	}
}
