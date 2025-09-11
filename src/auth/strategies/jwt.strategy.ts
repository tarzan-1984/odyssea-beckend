import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
			ignoreExpiration: false,
			secretOrKey: jwtSecret,
		});
	}

	async validate(payload: JwtPayload) {
		const user = await this.prisma.user.findUnique({
			where: { id: payload.sub },
		});

		if (!user) {
			throw new UnauthorizedException('User not found');
		}

		return {
			id: user.id,
			email: user.email,
			role: user.role,
		};
	}
}
