import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { normalizeTmsCurrentLocation } from './tms-current-location.util';

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

	private serializeAggregateError(err: unknown): unknown {
		const maybe = err as { errors?: unknown[] };
		if (!maybe || !Array.isArray(maybe.errors)) return null;
		return maybe.errors.map((e) => {
			if (e instanceof Error) {
				return {
					name: e.name,
					message: e.message,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					code: (e as any).code,
					cause:
						e.cause instanceof Error
							? e.cause.message
							: e.cause != null
								? String(e.cause)
								: undefined,
				};
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return { raw: String(e), code: (e as any)?.code };
		});
	}

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
				return;
			}

			const msg = this.extractErrorMessage(res.status, res.data);
			this.logger.error(
				`------------------------------------------\n[LOCATION_TMS_SYNC_BATCH]\nattempt=${attempt}/${maxAttempts} resStatus=${res.status}\nmsg=${msg}\n------------------------------------------`,
			);
			throw new Error(`TMS batch rejected [attempt=${attempt}/${maxAttempts}]: ${msg}`);
		} catch (error) {
			if (axios.isAxiosError(error) && error.response) {
				const status = error.response.status;
				const msg = this.extractErrorMessage(status, error.response.data);
				this.logger.error(
					`------------------------------------------\n[LOCATION_TMS_SYNC_BATCH]\nattempt=${attempt}/${maxAttempts} axiosHttpStatus=${status}\nmsg=${msg}\n------------------------------------------`,
				);
				if (attempt < maxAttempts) {
					this.logger.warn(
						`[LOCATION_TMS_SYNC_BATCH] retrying after http error attempt=${attempt}/${maxAttempts} status=${status}`,
					);
					await this.delay(2000);
					return this.sendBatch(items, attempt + 1, maxAttempts);
				}
				throw new Error(
					`TMS batch HTTP ${status} [attempt=${attempt}/${maxAttempts}]: ${msg}`,
				);
			}
			if (error instanceof Error) {
				const aggregate =
					error.name === 'AggregateError'
						? this.serializeAggregateError(error)
						: null;
				this.logger.error(
					`------------------------------------------\n[LOCATION_TMS_SYNC_BATCH]\nattempt=${attempt}/${maxAttempts} exception=${error.name}\nmessage=${error.message}\naggregateErrors=${aggregate ? JSON.stringify(aggregate) : ''}\n------------------------------------------`,
				);
				if (attempt < maxAttempts) {
					this.logger.warn(
						`[LOCATION_TMS_SYNC_BATCH] retrying after exception attempt=${attempt}/${maxAttempts} name=${error.name}`,
					);
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

/** TMS batch API expects numeric driver_id; returns null if externalId is not a digit string. */
export function parseTmsDriverIdFromExternalId(
	externalId: string | null | undefined,
): number | null {
	const trimmed = externalId?.trim();
	if (!trimmed || !/^\d+$/.test(trimmed)) {
		return null;
	}
	const n = parseInt(trimmed, 10);
	return Number.isFinite(n) ? n : null;
}

/** Build one batch item for manual/driver location sync (same shape as cron batch). */
export function buildTmsBatchLocationItem(params: {
	externalId: string;
	driverStatus: string;
	statusDateFormatted: string;
	/** User `location` column (free-text); drives TMS `current_location` after normalization. */
	location: string;
	city: string;
	zip: string;
	latitude: number;
	longitude: number;
	country: string;
	notes?: string;
}): TmsBatchLocationItem | null {
	const driverId = parseTmsDriverIdFromExternalId(params.externalId);
	if (driverId === null) {
		return null;
	}
	const country = params.country;
	const notes = params.notes ?? '';
	const locationTrimmed = params.location?.trim() ?? '';
	const latOk =
		params.latitude != null && Number.isFinite(params.latitude);
	const lngOk =
		params.longitude != null && Number.isFinite(params.longitude);
	return {
		driver_id: driverId,
		latitude: latOk ? String(params.latitude) : '',
		longitude: lngOk ? String(params.longitude) : '',
		current_city: params.city?.trim() ?? '',
		current_location: locationTrimmed
			? normalizeTmsCurrentLocation(params.location)
			: '',
		current_zipcode: params.zip?.trim() ?? '',
		driver_status: params.driverStatus?.trim() ?? '',
		status_date: params.statusDateFormatted?.trim() ?? '',
		country,
		current_country: country,
		notes,
	};
}
