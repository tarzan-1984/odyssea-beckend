import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AxiosError } from '../types/request.types';

const TMS_DRIVER_APPLICATION_ACTIVATE_URL =
	'https://www.endurance-tms.com/wp-json/tms/v1/driver/application/activate';

@Injectable()
export class TmsDriverApplicationService {
	private readonly logger = new Logger(TmsDriverApplicationService.name);

	constructor(
		private readonly configService: ConfigService,
		private readonly prisma: PrismaService,
	) {}

	/**
	 * Notifies TMS that the driver has activated the mobile app (user.status → ACTIVE).
	 * Best-effort: errors are logged, not thrown.
	 */
	async notifyDriverApplicationActivated(
		driverExternalId: string | null | undefined,
	): Promise<boolean> {
		const trimmed = driverExternalId?.trim();
		if (!trimmed) {
			this.logger.warn(
				'Skipping TMS driver/application/activate: empty externalId',
			);
			return false;
		}

		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			this.logger.warn(
				'Skipping TMS driver/application/activate: TMS_API_KEY not set',
			);
			return false;
		}

		const driver_id = /^\d+$/.test(trimmed)
			? parseInt(trimmed, 10)
			: trimmed;

		try {
			await axios.post(
				TMS_DRIVER_APPLICATION_ACTIVATE_URL,
				{ driver_id },
				{
					headers: {
						'X-API-Key': apiKey,
						'Content-Type': 'application/json',
					},
					timeout: 15000,
				},
			);
			this.logger.log(
				`TMS driver/application/activate sent for driver_id=${String(driver_id)}`,
			);
			return true;
		} catch (error) {
			const ax = error as AxiosError;
			this.logger.error(
				`TMS driver/application/activate failed for driver_id=${String(driver_id)}: ${ax.message}`,
				ax.response?.data != null
					? JSON.stringify(ax.response.data)
					: undefined,
			);
			return false;
		}
	}

	async backfillActivatedDriversFromLastActiveApp(): Promise<{
		total: number;
		sent: number;
		failed: number;
		failedDrivers: Array<{ id: string; externalId: string; email: string | null }>;
	}> {
		const drivers = await this.prisma.user.findMany({
			where: {
				status: UserStatus.ACTIVE,
				role: UserRole.DRIVER,
				lastActiveApp: { not: null },
				externalId: { not: null },
			},
			select: {
				id: true,
				email: true,
				externalId: true,
			},
			orderBy: { lastActiveApp: 'asc' },
		});

		let sent = 0;
		const failedDrivers: Array<{
			id: string;
			externalId: string;
			email: string | null;
		}> = [];

		for (const driver of drivers) {
			const externalId = driver.externalId?.trim();
			if (!externalId) {
				continue;
			}

			const ok = await this.notifyDriverApplicationActivated(externalId);
			if (ok) {
				sent++;
			} else {
				failedDrivers.push({
					id: driver.id,
					externalId,
					email: driver.email ?? null,
				});
			}
		}

		return {
			total: drivers.length,
			sent,
			failed: failedDrivers.length,
			failedDrivers,
		};
	}
}
