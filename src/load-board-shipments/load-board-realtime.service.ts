import { Injectable, Logger } from '@nestjs/common';
import { LOAD_BOARD_ALLOWED_ROLES } from '../common/user-role-access';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';

export type LoadBoardShipmentRealtimeReason =
	| 'created'
	| 'updated'
	| 'deleted';

/**
 * Broadcasts load board shipment create/update to everyone with Load board access.
 * Clients join `role_${role}` on connect (ChatGateway); we emit to those rooms.
 */
@Injectable()
export class LoadBoardRealtimeService {
	private readonly logger = new Logger(LoadBoardRealtimeService.name);

	constructor(
		private readonly notificationsWebSocketService: NotificationsWebSocketService,
	) {}

	emitShipmentUpdated(
		shipmentId: number,
		reason: LoadBoardShipmentRealtimeReason,
		options: { requestingUserId?: string } = {},
	) {
		if (!this.notificationsWebSocketService.isServerInitialized()) {
			this.logger.warn(
				`Skipping loadBoardShipmentUpdated for shipment ${shipmentId}: WebSocket server is not initialized`,
			);
			return;
		}

		const server = this.notificationsWebSocketService.getServer();
		if (!server) {
			return;
		}

		const rooms = new Set(
			LOAD_BOARD_ALLOWED_ROLES.map((role) => `role_${role}`),
		);

		const requestingUserId = options.requestingUserId?.trim();
		if (requestingUserId) {
			rooms.add(`user_${requestingUserId}`);
		}

		server.to(Array.from(rooms)).emit('loadBoardShipmentUpdated', {
			shipmentId,
			reason,
			refreshedAt: new Date().toISOString(),
		});
	}
}
