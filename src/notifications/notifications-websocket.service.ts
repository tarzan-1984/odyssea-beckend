import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { userDeviceSocketRoom } from '../common/user-device-socket.util';

@Injectable()
export class NotificationsWebSocketService {
	private readonly logger = new Logger(NotificationsWebSocketService.name);

	// WebSocket server (chat / admin UI / public tracking)
	private server: Server;

	setServer(server: Server) {
		if (!server) {
			this.logger.error(
				'NotificationsWebSocketService: Attempted to set null server',
			);
			return;
		}
		this.server = server;
	}

	getServer(): Server | null {
		return this.server || null;
	}

	isServerInitialized(): boolean {
		return !!this.server;
	}

	/**
	 * Send notification to specific user via WebSocket
	 */
	async sendNotificationToUser(userId: string, notification: any) {
		try {
			if (!this.server) {
				this.logger.warn('WebSocket server not initialized');
				return;
			}

			// Send notification to specific user
			this.server.to(`user_${userId}`).emit('notification', notification);
		} catch (error) {
			this.logger.error(
				`Failed to send notification to user ${userId}:`,
				error,
			);
		}
	}

	/**
	 * Send updated unread count to specific user
	 */
	async sendUnreadCountToUser(userId: string, unreadCount: number) {
		try {
			if (!this.server) {
				this.logger.warn('WebSocket server not initialized');
				return;
			}

			// Send unread count update to specific user
			this.server
				.to(`user_${userId}`)
				.emit('unreadCountUpdate', { unreadCount });
		} catch (error) {
			this.logger.error(
				`Failed to send unread count to user ${userId}:`,
				error,
			);
		}
	}

	/**
	 * Send user location update event (used by admin/Next.js UI)
	 */
	async sendUserLocationUpdate(userId: string, payload: any) {
		try {
			if (!this.server) {
				this.logger.warn(
					'WebSocket server not initialized for userLocationUpdate',
				);
				return;
			}

			// Send to authenticated user-specific room (for internal tools / admin UI)
			this.server
				.to(`user_${userId}`)
				.emit('userLocationUpdate', payload);
			// Also broadcast publicly so anonymous viewers on tracking page can see updates
			// Public connections (without token) can listen to this event
			this.server.emit('userLocationUpdate', payload);
		} catch (error) {
			this.logger.error(
				`Failed to send user location update for user ${userId}:`,
				error,
			);
		}
	}

	async sendDriverTrackingPointCreated(payload: any) {
		try {
			if (!this.server) {
				this.logger.warn(
					'WebSocket server not initialized for driverTrackingPointCreated',
				);
				return;
			}

			this.server.emit('driverTrackingPointCreated', payload);
		} catch (error) {
			this.logger.error('Failed to send driver tracking point event:', error);
		}
	}

	/**
	 * Broadcast notification to all connected users (if needed)
	 */
	async broadcastNotification(notification: any) {
		try {
			if (!this.server) {
				this.logger.warn('WebSocket server not initialized');
				return;
			}

			this.server.emit('notification', notification);
		} catch (error) {
			this.logger.error('Failed to broadcast notification:', error);
		}
	}

	/**
	 * Send driver status update to specific driver via WebSocket
	 */
	async sendDriverStatusUpdate(
		userId: string,
		payload: {
			driverStatus: string | null;
			isAutoupdate: boolean;
			deactivateAccount?: boolean;
		},
	) {
		try {
			if (!this.server) {
				this.logger.warn('WebSocket server not initialized');
				return;
			}

			// Send driver status update to specific user
			this.server.to(`user_${userId}`).emit('driverStatusUpdate', payload);

			this.logger.log(
				`Driver status update sent to user ${userId}: ${payload.driverStatus || 'null'} isAutoupdate=${payload.isAutoupdate}`,
			);
		} catch (error) {
			this.logger.error(
				`Failed to send driver status update to user ${userId}:`,
				error,
			);
		}
	}

	/**
	 * Full driver profile fields after TMS/webhook sync (mobile uses this to refresh UI + TMS payload).
	 */
	async sendDriverProfileSync(
		userId: string,
		payload: {
			driverStatus: string | null;
			zip: string | null;
			city: string | null;
			state: string | null;
			location: string | null;
			statusDate: string | null;
			isAutoupdate: boolean;
			deactivateAccount?: boolean;
		},
	) {
		try {
			if (!this.server) {
				this.logger.warn('WebSocket server not initialized');
				return;
			}

			this.server.to(`user_${userId}`).emit('driverProfileSync', payload);

			this.logger.log(
				`Driver profile sync sent to user ${userId}: status=${payload.driverStatus || 'null'} isAutoupdate=${payload.isAutoupdate}`,
			);
		} catch (error) {
			this.logger.error(
				`Failed to send driver profile sync to user ${userId}:`,
				error,
			);
		}
	}

	/**
	 * Broadcast that global mobile app settings changed (location thresholds, environment gate,
	 * max concurrent offer bids, etc.). Clients should re-fetch GET /v1/app-settings and apply locally.
	 */
	/**
	 * Broadcast that TMS load data changed (POST /v1/tms/load/update webhook).
	 * Mobile clients refetch the loads list and refresh the open load detail screen.
	 */
	async broadcastTmsLoadUpdated(payload: {
		loadId: string;
		project?: string;
		isFlt?: boolean;
	}) {
		try {
			if (!this.server) {
				this.logger.warn('WebSocket server not initialized');
				return;
			}

			this.server.emit('tmsLoadUpdated', {
				loadId: payload.loadId,
				project: payload.project,
				is_flt: payload.isFlt,
			});

			this.logger.log(
				`TMS load updated broadcast loadId=${payload.loadId} project=${payload.project ?? 'n/a'}`,
			);
		} catch (error) {
			this.logger.error('Failed to broadcast TMS load update:', error);
		}
	}

	async broadcastAppLocationSettingsUpdated(payload?: {
		updatedAt?: string;
	}) {
		try {
			if (!this.server) {
				this.logger.warn('WebSocket server not initialized');
				return;
			}
			this.server.emit('appLocationSettingsUpdated', {
				updatedAt: payload?.updatedAt,
			});
		} catch (error) {
			this.logger.error(
				'Failed to broadcast app location settings update:',
				error,
			);
		}
	}

	/**
	 * Force logout on a single mobile installation (removed, blocked, etc.).
	 */
	async sendDeviceForceLogout(
		userId: string,
		deviceId: string,
		reason: 'device_removed' | 'device_blocked',
	) {
		try {
			if (!this.server) {
				this.logger.warn('WebSocket server not initialized');
				return;
			}
			const room = userDeviceSocketRoom(userId, deviceId);
			if (!room) {
				return;
			}
			this.server.to(room).emit('deviceDeactivated', {
				deviceId: deviceId.trim(),
				reason,
			});
			this.logger.log(
				`Device force logout sent userId=${userId} deviceId=${deviceId.trim()} reason=${reason}`,
			);
		} catch (error) {
			this.logger.error(
				`Failed to send device force logout userId=${userId} reason=${reason}:`,
				error,
			);
		}
	}

	/** Force logout after the user removed the device from Settings or admin soft-delete. */
	async sendDeviceDeactivatedLogout(userId: string, deviceId: string) {
		return this.sendDeviceForceLogout(userId, deviceId, 'device_removed');
	}

	/** Force logout after admin blocked the device. */
	async sendDeviceBlockedLogout(userId: string, deviceId: string) {
		return this.sendDeviceForceLogout(userId, deviceId, 'device_blocked');
	}
}
