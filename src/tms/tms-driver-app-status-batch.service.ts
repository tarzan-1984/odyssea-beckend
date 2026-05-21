import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const TMS_DRIVER_APP_STATUS_BATCH_URL =
	'https://www.endurance-tms.com/wp-json/tms/v1/driver/app/status/update/batch';

/** Payload field names match TMS API; times as naive `YYYY-MM-DD HH:mm:ss` (same as DB text/timestamp semantics). */
export type TmsBatchAppStatusItem = {
	driver_id: number;
	/** From DB `last_active_app` formatted as SQL-like local string written at save time (UTC-encoded Date digits). */
	app_online: string;
	/** From DB `lastLocationUpdateAt` column as stored (typically `YYYY-MM-DD HH:mm:ss`). */
	app_update: string;
};

@Injectable()
export class TmsDriverAppStatusBatchService {
	constructor(private readonly configService: ConfigService) {}

	async sendBatch(
		items: TmsBatchAppStatusItem[],
		attempt = 1,
		maxAttempts = 2,
	): Promise<void> {
		if (items.length === 0) {
			return;
		}

		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			throw new Error('TMS app status batch: TMS_API_KEY not configured');
		}

		try {
			const res = await axios.post(
				TMS_DRIVER_APP_STATUS_BATCH_URL,
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
				return;
			}

			const msg = this.extractErrorMessage(res.status, res.data);
			throw new Error(`TMS app status batch rejected: ${msg}`);
		} catch (error) {
			if (axios.isAxiosError(error) && error.response) {
				const status = error.response.status;
				const msg = this.extractErrorMessage(status, error.response.data);
				if (attempt < maxAttempts) {
					await this.delay(2000);
					return this.sendBatch(items, attempt + 1, maxAttempts);
				}
				throw new Error(`TMS app status batch HTTP ${status}: ${msg}`);
			}
			if (error instanceof Error) {
				if (attempt < maxAttempts) {
					await this.delay(2000);
					return this.sendBatch(items, attempt + 1, maxAttempts);
				}
				throw error;
			}
			throw new Error('TMS app status batch failed');
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
