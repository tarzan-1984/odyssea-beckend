import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateTmsBatchAppSettingsDto } from './dto/update-tms-batch-app-settings.dto';
import { UpdateLocationEnvironmentAppSettingsDto } from './dto/update-location-environment-app-settings.dto';
import { UpdateOffersAppSettingsDto } from './dto/update-offers-app-settings.dto';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';

const GLOBAL_APP_SETTINGS_ID = 'global';

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
				tmsBatchCronIntervalSeconds: 300,
				tmsBatchChunkSize: 150,
				locationEnvironmentMode: 'live',
				locationTestDriverExternalId: '3343',
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
			},
		});
		void this.notificationsWebSocketService.broadcastAppLocationSettingsUpdated({
			updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
		});
		return this.getMobileAppSettings();
	}

	/**
	 * Mobile clients: same row but only mobile-consumed fields:
	 * - location throttling (interval, distance, reverse geocode distance)
	 * - location environment gate (live vs test driver externalId)
	 */
	async getMobileAppSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			locationMinIntervalMs: row.locationMinIntervalMs,
			locationMinDistanceM: row.locationMinDistanceM,
			reverseGeocodeMinDistanceM: row.reverseGeocodeMinDistanceM,
			locationEnvironmentMode: row.locationEnvironmentMode as 'live' | 'test',
			locationTestDriverExternalId: row.locationTestDriverExternalId,
			maxDriverOpenOfferParticipations: row.maxDriverOpenOfferParticipations,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}

	async getOffersAppSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			maxDriverOpenOfferParticipations: row.maxDriverOpenOfferParticipations,
			updatedAt: row.updatedAt,
		};
	}

	async updateOffersAppSettings(dto: UpdateOffersAppSettingsDto) {
		await this.getGlobal();
		const row = await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: {
				maxDriverOpenOfferParticipations: dto.maxDriverOpenOfferParticipations,
			},
		});
		void this.notificationsWebSocketService.broadcastAppLocationSettingsUpdated({
			updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
		});
		return this.getOffersAppSettings();
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

	async getLocationEnvironmentAppSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			locationEnvironmentMode: row.locationEnvironmentMode as 'live' | 'test',
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
		void this.notificationsWebSocketService.broadcastAppLocationSettingsUpdated({
			updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
		});
		return this.getLocationEnvironmentAppSettings();
	}
}
