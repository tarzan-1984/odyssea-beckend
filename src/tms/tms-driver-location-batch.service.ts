import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const TMS_DRIVER_LOCATION_BATCH_URL =
	'https://www.endurance-tms.com/wp-json/tms/v1/driver/location/update/batch';

export type TmsBatchLocationItem = {
	driver_id: number;
	latitude: string;
	longitude: string;
	current_city: string;
	current_location: string;
	current_zipcode: string;
	driver_status: string;
	status_date: string;
	country: string;
	current_country: string;
	notes: string;
};

@Injectable()
export class TmsDriverLocationBatchService {
	private readonly logger = new Logger(TmsDriverLocationBatchService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * POST batch location update to TMS. Throws on non-2xx after retries exhausted (caller handles).
	 */
	async sendBatch(
		items: TmsBatchLocationItem[],
		attempt = 1,
		maxAttempts = 2,
	): Promise<void> {
		if (items.length === 0) {
			return;
		}

		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			throw new Error('TMS batch: TMS_API_KEY not configured');
		}

		const url = `${TMS_DRIVER_LOCATION_BATCH_URL}?user_id=1`;

		try {
			const res = await axios.post(
				url,
				{ items },
				{
					headers: {
						'X-API-Key': apiKey,
						'Content-Type': 'application/json',
					},
					timeout: 120_000,
					validateStatus: () => true,
				},
			);

			if (res.status >= 200 && res.status < 300) {
				this.logger.log(
					`TMS batch OK: ${items.length} driver(s), HTTP ${res.status}`,
				);
				return;
			}

			const msg = this.extractErrorMessage(res.status, res.data);
			throw new Error(`TMS batch rejected: ${msg}`);
		} catch (error) {
			if (axios.isAxiosError(error) && error.response) {
				const status = error.response.status;
				const msg = this.extractErrorMessage(status, error.response.data);
				this.logger.error(
					`TMS batch HTTP ${status} (attempt ${attempt}/${maxAttempts}): ${msg}`,
				);
				if (attempt < maxAttempts) {
					await this.delay(2000);
					return this.sendBatch(items, attempt + 1, maxAttempts);
				}
				throw new Error(`TMS batch HTTP ${status}: ${msg}`);
			}
			if (error instanceof Error) {
				this.logger.error(
					`TMS batch error (attempt ${attempt}/${maxAttempts}): ${error.message}`,
				);
				if (attempt < maxAttempts) {
					await this.delay(2000);
					return this.sendBatch(items, attempt + 1, maxAttempts);
				}
				throw error;
			}
			throw new Error('TMS batch failed');
		}
	}

	private extractErrorMessage(status: number, data: unknown): string {
		if (data && typeof data === 'object') {
			const o = data as { message?: string; error?: string };
			if (o.message) return String(o.message);
			if (o.error) return String(o.error);
		}
		if (typeof data === 'string') return data;
		return `HTTP ${status}`;
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
