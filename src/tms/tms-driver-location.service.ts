import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const TMS_DRIVER_LOCATION_UPDATE_URL =
	'https://www.endurance-tms.com/wp-json/tms/v1/driver/location/update';

export type TmsDriverLocationPayload = {
	externalId: string;
	driverStatus: string;
	statusDateFormatted: string;
	state: string;
	city: string;
	zip: string;
	latitude: number;
	longitude: number;
	country: string;
};

@Injectable()
export class TmsDriverLocationService {
	private readonly logger = new Logger(TmsDriverLocationService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Pushes driver location to TMS (same shape as legacy mobile client).
	 * @throws Error with message on non-2xx or network failure
	 */
	async sendDriverLocationUpdate(payload: TmsDriverLocationPayload): Promise<void> {
		const trimmed = payload.externalId?.trim();
		if (!trimmed) {
			throw new Error('TMS location sync skipped: empty externalId');
		}

		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			throw new Error('TMS location sync failed: TMS_API_KEY not configured');
		}

		const driverParam = /^\d+$/.test(trimmed) ? trimmed : encodeURIComponent(trimmed);
		const url = `${TMS_DRIVER_LOCATION_UPDATE_URL}?driver_id=${driverParam}&user_id=1`;

		const body = {
			driver_status: payload.driverStatus ?? '',
			status_date: payload.statusDateFormatted,
			current_location: payload.state || 'NY',
			current_city: payload.city || 'New York',
			current_zipcode: payload.zip || '',
			latitude: String(payload.latitude),
			longitude: String(payload.longitude),
			country: payload.country,
			current_country: payload.country,
			notes: 'Driver is available for new loads',
		};

		try {
			const res = await axios.post(url, body, {
				headers: {
					'X-API-Key': apiKey,
					'Content-Type': 'application/json',
				},
				timeout: 30000,
				validateStatus: () => true,
			});

			if (res.status >= 200 && res.status < 300) {
				this.logger.log(
					`TMS driver/location/update OK for driver_id=${trimmed}`,
				);
				return;
			}

			const msg =
				(res.data as { message?: string })?.message ||
				(res.data as { error?: string })?.error ||
				`HTTP ${res.status}`;
			throw new Error(`TMS rejected location update: ${msg}`);
		} catch (error) {
			if (axios.isAxiosError(error) && error.response) {
				const status = error.response.status;
				const data = error.response.data;
				const msg =
					data?.message ||
					data?.error ||
					(typeof data === 'string' ? data : JSON.stringify(data));
				this.logger.error(
					`TMS driver/location/update failed (${status}) for driver_id=${trimmed}: ${msg}`,
				);
				throw new Error(`TMS HTTP ${status}: ${msg}`);
			}
			if (error instanceof Error) {
				this.logger.error(
					`TMS driver/location/update error for driver_id=${trimmed}: ${error.message}`,
				);
				throw error;
			}
			throw new Error('TMS location update failed');
		}
	}
}
