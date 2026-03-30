import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AxiosError } from '../types/request.types';

const TMS_DRIVER_APPLICATION_ACTIVATE_URL =
	'https://www.endurance-tms.com/wp-json/tms/v1/driver/application/activate';

@Injectable()
export class TmsDriverApplicationService {
	private readonly logger = new Logger(TmsDriverApplicationService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Notifies TMS that the driver has activated the mobile app (user.status → ACTIVE).
	 * Best-effort: errors are logged, not thrown.
	 */
	async notifyDriverApplicationActivated(
		driverExternalId: string | null | undefined,
	): Promise<void> {
		const trimmed = driverExternalId?.trim();
		if (!trimmed) {
			this.logger.warn(
				'Skipping TMS driver/application/activate: empty externalId',
			);
			return;
		}

		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			this.logger.warn(
				'Skipping TMS driver/application/activate: TMS_API_KEY not set',
			);
			return;
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
		} catch (error) {
			const ax = error as AxiosError;
			this.logger.error(
				`TMS driver/application/activate failed for driver_id=${String(driver_id)}: ${ax.message}`,
				ax.response?.data != null
					? JSON.stringify(ax.response.data)
					: undefined,
			);
		}
	}
}
