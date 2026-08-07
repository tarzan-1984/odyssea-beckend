import { Injectable, Logger } from '@nestjs/common';
import { LOAD_BOARD_ALLOWED_ROLES } from '../common/user-role-access';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';

export type LoadBoardShipmentRealtimeReason =
	| 'created'
	| 'updated'
	| 'posted'
	| 'unposted'
	| 'deleted';

/**
 * Broadcasts load board shipment create/update/status/delete to everyone with
 * Load board access. Clients join `role_${role}` on connect (ChatGateway).
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

		const roomList = Array.from(rooms);
		const payload = {
			shipmentId,
			reason,
			refreshedAt: new Date().toISOString(),
		};

		// Emit per room (same pattern reliability as multi-room staff broadcasts)
		for (const room of roomList) {
			server.to(room).emit('loadBoardShipmentUpdated', payload);
		}

		this.logger.debug(
			`loadBoardShipmentUpdated shipment=${shipmentId} reason=${reason} rooms=${roomList.length}`,
		);
	}
}
