import { CanActivate, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketContext } from '../../types/request.types';

interface AuthenticatedSocket extends Socket {
	userId?: string;
	userRole?: string;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
	constructor(
		private jwtService: JwtService,
		private configService: ConfigService,
	) {}

	async canActivate(context: WebSocketContext): Promise<boolean> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const client: AuthenticatedSocket = context
				.switchToWs()
				.getClient();
			const token = this.extractTokenFromHeader(client);

			if (!token) {
				console.log('❌ WebSocket JWT Guard: No token provided');
				throw new WsException('Unauthorized - no token provided');
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const payload = await this.jwtService.verifyAsync(token);

			// Attach user info to socket for later use
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
			client.userId = payload.sub;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
			client.userRole = payload.role;

			return true;
		} catch (error) {
			console.log('❌ WebSocket JWT Guard: Authentication failed', {
				error: error.message,
			});
			throw new WsException('Unauthorized - invalid token');
		}
	}

	private extractTokenFromHeader(client: Socket): string | undefined {
		const auth =
			(client.handshake.auth?.token as string) ||
			(client.handshake.headers?.authorization as string) ||
			(client.handshake.query?.token as string);

		if (!auth) {
			return undefined;
		}

		// Handle both "Bearer token" and direct token formats
		if (auth.startsWith('Bearer ')) {
			return auth.substring(7);
		}

		return auth;
	}
}
