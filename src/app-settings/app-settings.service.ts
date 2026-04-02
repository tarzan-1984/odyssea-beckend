import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateTmsBatchAppSettingsDto } from './dto/update-tms-batch-app-settings.dto';

const GLOBAL_APP_SETTINGS_ID = 'global';

@Injectable()
export class AppSettingsService {
	constructor(private readonly prisma: PrismaService) {}

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
			},
			update: {},
		});
	}

	/**
	 * Mobile app throttling only (does not change TMS batch fields).
	 */
	async updateGlobal(dto: UpdateAppSettingsDto) {
		await this.getGlobal();
		await this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: {
				locationMinIntervalMs: dto.locationMinIntervalMs,
				locationMinDistanceM: dto.locationMinDistanceM,
				reverseGeocodeMinDistanceM: dto.reverseGeocodeMinDistanceM,
			},
		});
		return this.getMobileAppSettings();
	}

	/**
	 * Mobile clients: same row but only location-throttling fields (no TMS batch params).
	 */
	async getMobileAppSettings() {
		const row = await this.getGlobal();
		return {
			id: row.id,
			locationMinIntervalMs: row.locationMinIntervalMs,
			locationMinDistanceM: row.locationMinDistanceM,
			reverseGeocodeMinDistanceM: row.reverseGeocodeMinDistanceM,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
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
}
