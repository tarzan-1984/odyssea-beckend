import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';

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
			},
			update: {},
		});
	}

	async updateGlobal(dto: UpdateAppSettingsDto) {
		await this.getGlobal();
		return this.prisma.appSetting.update({
			where: { id: GLOBAL_APP_SETTINGS_ID },
			data: {
				locationMinIntervalMs: dto.locationMinIntervalMs,
				locationMinDistanceM: dto.locationMinDistanceM,
			},
		});
	}
}
