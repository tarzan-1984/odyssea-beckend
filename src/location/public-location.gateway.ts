import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';

@WebSocketGateway({
  namespace: '/public-location',
  cors: {
    origin: '*',
    credentials: false,
  },
})
export class PublicLocationGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PublicLocationGateway.name);

  constructor(
    private readonly notificationsWebSocketService: NotificationsWebSocketService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('✅ PublicLocationGateway initialized');
    this.notificationsWebSocketService.setPublicServer(server);
  }
}


