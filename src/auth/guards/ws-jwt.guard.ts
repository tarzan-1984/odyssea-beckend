import { CanActivate, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

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

  async canActivate(context: any): Promise<boolean> {
    try {
      const client: AuthenticatedSocket = context.switchToWs().getClient();
      const token = this.extractTokenFromHeader(client);
      
      if (!token) {
        throw new WsException('Unauthorized - no token provided');
      }

      const payload = await this.jwtService.verifyAsync(token);

      // Attach user info to socket for later use
      client.userId = payload.sub;
      client.userRole = payload.role;

      return true;
    } catch (error) {
      throw new WsException('Unauthorized - invalid token');
    }
  }

  private extractTokenFromHeader(client: Socket): string | undefined {
    const auth = client.handshake.auth?.token || 
                 client.handshake.headers?.authorization ||
                 client.handshake.query?.token;

    if (!auth) {
      return undefined;
    }

    // Handle both "Bearer token" and direct token formats
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.substring(7);
    }

    return auth;
  }
}
