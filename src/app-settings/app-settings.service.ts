import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateTmsBatchAppSettingsDto } from './dto/update-tms-batch-app-settings.dto';
import { UpdateLocationEnvironmentAppSettingsDto } from './dto/update-location-environment-app-settings.dto';
import { UpdateOffersAppSettingsDto } from './dto/update-offers-app-settings.dto';
import { UpdateDeliveredLoadChatAppSettingsDto } from './dto/update-delivered-load-chat-app-settings.dto';
import { UpdateMinimumAppVersionDto } from './dto/update-minimum-app-version.dto';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';
import { UserRole, UserStatus } from '@prisma/client';
import { registerUserDeviceActivity, getUserDeviceAccessState, shouldForceLogoutForDeviceAccess } from '../common/upsert-user-device';
import {
	parseMobileDeviceSyncPayload,
	hasAnyMobileDeviceSyncInput,
	type MobileDeviceSyncPayload,
} from '../common/mobile-device-sync.util';
import type { MobileDeviceSyncQueryDto } from './dto/mobile-device-sync-query.dto';

const GLOBAL_APP_SETTINGS_ID = 'global';

function nowInTimeZoneAsNaiveDate(timeZone: string): Date {
	// We store `timestamp without time zone` in DB. This helper builds a Date whose
	// UTC components match the target TZ wall-clock time (so the stored value reads
	// as that local time in SQL).
	const now = new Date();
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(now);

	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? '';
	const year = Number(get('year'));
	const month = Number(get('month'));
	const day = Number(get('day'));
	const hour = Number(get('hour'));
	const minute = Number(get('minute'));
	const second = Number(get('second'));

	return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

@Injectable()
export class AppSettingsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly notificationsWebSocketService: NotificationsWebSocketService,
	) {}

	/**
	 * Singleton row; creates defaults if missing (e.g. before migration on a fresh DB).
	 */
	async getGlobal() {
		return this.prisma.appSetting.upsert({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			create: {
				id: GLOBAL_APP_SETTINGS_ID,
				locationMinIntervalMs: 60_000,
				locationMinDistanceM: 1000,
				reverseGeocodeMinDistanceM: 5000,
				driverTrackingPointMinIntervalMs: 30 * 60 * 1000,
				tmsBatchCronIntervalSeconds: 300,
				tmsBatchChunkSize: 150,
				locationEnvironmentMode: 'live',
				locationTestDriverExternalId: '3343',
				deliveredLoadChatArchiveAfterHours: 5,
			},
			update: {},
		});
	}

	/**
	 * Mobile app throttling only (does not change TMS batch fields).
	 */
	async updateGlobal(dto: UpdateAppSettingsDto) {
		await this.getGlobal();
		const row = await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: {
				locationMinIntervalMs: dto.locationMinIntervalMs,
				locationMinDistanceM: dto.locationMinDistanceM,
				reverseGeocodeMinDistanceM: dto.reverseGeocodeMinDistanceM,
				...(dto.driverTrackingPointMinIntervalMs !== undefined
					? {
							driverTrackingPointMinIntervalMs:
								dto.driverTrackingPointMinIntervalMs,
						}
					: {}),
			},
		});
		void this.notificationsWebSocketService.broadcastAppLocationSettingsUpdated(
			{
				updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
			},
		);
		return this.getMobileAppSettings();
	}

	/**
	 * Mobile clients: same row but only mobile-consumed fields:
	 * - location throttling (interval, distance, reverse geocode distance)
	 * - location environment gate (live vs test driver externalId)
	 */
	async getMobileAppSettings() {
		// Note: lastActiveApp is tracked per-user (see controller GET /app-settings).
		const row = await this.getGlobal();
		return {
			id: row.id,
			locationMinIntervalMs: row.locationMinIntervalMs,
			locationMinDistanceM: row.locationMinDistanceM,
			reverseGeocodeMinDistanceM: row.reverseGeocodeMinDistanceM,
			driverTrackingPointMinIntervalMs:
				row.driverTrackingPointMinIntervalMs,
			locationEnvironmentMode: row.locationEnvironmentMode as
				| 'live'
				| 'test',
			locationTestDriverExternalId: row.locationTestDriverExternalId,
			maxDriverOpenOfferParticipations:
				row.maxDriverOpenOfferParticipations,
			minimumAppVersion: row.minimumAppVersion ?? '',
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}

	async getDriverTrackingPointMinIntervalMs(): Promise<number> {
		const row = await this.getGlobal();
		return row.driverTrackingPointMinIntervalMs;
	}

	async recordUserLastActiveApp(
		userId: string,
		deviceSync?: MobileDeviceSyncQueryDto | MobileDeviceSyncPayload | null,
	): Promise<boolean> {
		if (!userId) return false;
		const lastActiveAt = nowInTimeZoneAsNaiveDate('America/New_York');
		try {
			const user = await this.prisma.user.findUnique({
				where: { id: userId },
				select: { id: true, externalId: true },
			});
			if (!user) {
				return false;
			}

			const devicePayload = parseMobileDeviceSyncPayload(deviceSync ?? null);
			const externalId = user.externalId?.trim();
			if (devicePayload?.deviceId && externalId) {
				const access = await getUserDeviceAccessState(
					this.prisma,
					externalId,
					devicePayload.deviceId,
				);
				if (shouldForceLogoutForDeviceAccess(access)) {
					return true;
				}
			}

			await this.prisma.user.update({
				where: { id: userId },
				data: {
					lastActiveApp: lastActiveAt,
				},
			});

			if (!externalId || !hasAnyMobileDeviceSyncInput(deviceSync ?? null)) {
				return false;
			}

			const syncInput = deviceSync ?? null;
			await registerUserDeviceActivity(
				this.prisma,
				{
					userExternalId: externalId,
					deviceId: devicePayload?.deviceId,
					platform: devicePayload?.platform ?? syncInput?.platform,
					appVersion: devicePayload?.appVersion ?? syncInput?.appVersion,
					deviceName: devicePayload?.deviceName ?? syncInput?.deviceName,
					model: devicePayload?.model ?? syncInput?.model,
					osVersion: devicePayload?.osVersion ?? syncInput?.osVersion,
					pushToken: devicePayload?.pushToken ?? syncInput?.pushToken,
					lastActiveAt,
				},
				{ createIfMissing: false },
			);
			return false;
		} catch {
			// Best-effort: never fail settings fetch due to tracking update.
			return false;
		}
	}

	async getMinimumAppVersionSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			minimumAppVersion: row.minimumAppVersion ?? '',
			updatedAt: row.updatedAt,
		};
	}

	async updateMinimumAppVersionSettings(dto: UpdateMinimumAppVersionDto) {
		await this.getGlobal();
		const minimumAppVersion = String(dto.minimumAppVersion ?? '').trim();
		const row = await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: { minimumAppVersion },
		});
		void this.notificationsWebSocketService.broadcastAppLocationSettingsUpdated(
			{
				updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
			},
		);
		return this.getMinimumAppVersionSettings();
	}

	async getOffersAppSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			maxDriverOpenOfferParticipations:
				row.maxDriverOpenOfferParticipations,
			updatedAt: row.updatedAt,
		};
	}

	async updateOffersAppSettings(dto: UpdateOffersAppSettingsDto) {
		await this.getGlobal();
		const row = await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: {
				maxDriverOpenOfferParticipations:
					dto.maxDriverOpenOfferParticipations,
			},
		});
		void this.notificationsWebSocketService.broadcastAppLocationSettingsUpdated(
			{
				updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
			},
		);
		return this.getOffersAppSettings();
	}

	async getAccountDeletionRequestSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			accountDeletionRequestEmail: row.accountDeletionRequestEmail ?? '',
			updatedAt: row.updatedAt,
		};
	}

	async updateAccountDeletionRequestSettings(dto: {
		accountDeletionRequestEmail: string;
	}) {
		await this.getGlobal();
		const email = String(dto.accountDeletionRequestEmail ?? '').trim();
		await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: { accountDeletionRequestEmail: email },
		});
		return this.getAccountDeletionRequestSettings();
	}

	async getTmsBatchAppSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			tmsBatchCronIntervalSeconds: row.tmsBatchCronIntervalSeconds,
			tmsBatchChunkSize: row.tmsBatchChunkSize,
			updatedAt: row.updatedAt,
		};
	}

	async getDeliveredLoadChatAppSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			deliveredLoadChatArchiveAfterHours:
				row.deliveredLoadChatArchiveAfterHours,
			updatedAt: row.updatedAt,
		};
	}

	async updateDeliveredLoadChatAppSettings(
		dto: UpdateDeliveredLoadChatAppSettingsDto,
	) {
		await this.getGlobal();
		await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: {
				deliveredLoadChatArchiveAfterHours:
					dto.deliveredLoadChatArchiveAfterHours,
			},
		});
		return this.getDeliveredLoadChatAppSettings();
	}

	/**
	 * Cutoff instant for LOAD chats with deliveryAt: rooms with deliveryAt <= this and
	 * isLoadArchived=false are processed by cleanup cron — with messages → isLoadArchived=true;
	 * with zero messages → chat row deleted (no archive value).
	 */
	async getDeliveredLoadChatArchiveCutoffDate(): Promise<Date> {
		const row = await this.getGlobal();
		let hours = row.deliveredLoadChatArchiveAfterHours;
		if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 1) {
			hours = 5;
		}
		if (hours > 720) {
			hours = 720;
		}
		return new Date(Date.now() - hours * 60 * 60 * 1000);
	}

	async getLocationEnvironmentAppSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			locationEnvironmentMode: row.locationEnvironmentMode as
				| 'live'
				| 'test',
			locationTestDriverExternalId: row.locationTestDriverExternalId,
			updatedAt: row.updatedAt,
		};
	}

	/**
	 * Backend TMS batch cron only — does not touch mobile throttling fields.
	 */
	async updateTmsBatchAppSettings(dto: UpdateTmsBatchAppSettingsDto) {
		await this.getGlobal();
		await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: {
				tmsBatchCronIntervalSeconds: dto.tmsBatchCronIntervalSeconds,
				tmsBatchChunkSize: dto.tmsBatchChunkSize,
			},
		});
		return this.getTmsBatchAppSettings();
	}

	async updateLocationEnvironmentAppSettings(
		dto: UpdateLocationEnvironmentAppSettingsDto,
	) {
		await this.getGlobal();
		const row = await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: {
				locationEnvironmentMode: dto.locationEnvironmentMode,
				locationTestDriverExternalId:
					dto.locationTestDriverExternalId.trim(),
			},
		});
		void this.notificationsWebSocketService.broadcastAppLocationSettingsUpdated(
			{
				updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
			},
		);
		return this.getLocationEnvironmentAppSettings();
	}

	/**
	 * Admin UI: usage stats based on:
	 * - users.status === ACTIVE
	 * - users.deactivateAccount is not true (exclude TMS soft-removed drivers)
	 * - drivers with driverStatus blocked or expired_documents are excluded
	 * - there is at least one device row in user_devices (multiple devices per account allowed)
	 *
	 * Drivers are users with role === DRIVER; "Users" are all other roles.
	 * Counts dedupe by user externalId per platform (one user with two phones counts once per platform).
	 */
	async getMobileUsageStats(): Promise<{
		users: { ios: number; android: number };
		drivers: { ios: number; android: number };
		total: { ios: number; android: number; all: number };
	}> {
		const rows = await this.prisma.userDevice.findMany({
			select: {
				platform: true,
				userExternalId: true,
				user: { select: { role: true, status: true, driverStatus: true } },
			},
			where: {
				user: {
					status: UserStatus.ACTIVE,
					deactivateAccount: { not: true },
				},
			},
		});

		const norm = (p: string | null | undefined) =>
			String(p ?? '')
				.trim()
				.toLowerCase();

		const usersIos = new Set<string>();
		const usersAndroid = new Set<string>();
		const driversIos = new Set<string>();
		const driversAndroid = new Set<string>();

		for (const r of rows) {
			const platform = norm(r.platform);
			if (platform !== 'ios' && platform !== 'android') continue;
			const isDriver = r.user.role === UserRole.DRIVER;
			if (isDriver) {
				const driverStatus = r.user.driverStatus?.trim().toLowerCase();
				if (
					driverStatus === 'blocked' ||
					driverStatus === 'expired_documents'
				) {
					continue;
				}
			}

			const key = r.userExternalId.trim();
			if (!key) continue;

			if (isDriver) {
				if (platform === 'ios') driversIos.add(key);
				else driversAndroid.add(key);
			} else {
				if (platform === 'ios') usersIos.add(key);
				else usersAndroid.add(key);
			}
		}

		const totalIos = usersIos.size + driversIos.size;
		const totalAndroid = usersAndroid.size + driversAndroid.size;

		return {
			users: { ios: usersIos.size, android: usersAndroid.size },
			drivers: { ios: driversIos.size, android: driversAndroid.size },
			total: {
				ios: totalIos,
				android: totalAndroid,
				all: totalIos + totalAndroid,
			},
		};
	}
}
