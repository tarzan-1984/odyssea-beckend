import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AxiosError } from '../types/request.types';

/** Project slug sent to TMS for Odyssea (per product config). */
export const TMS_DRAFT_LOADS_PROJECT = 'odysseia';

export type TmsDraftLoadRow = {
	id: number;
	date_created: string;
	date_updated: string;
	pick_up_date: string;
	delivery_date: string;
	offer_id: string;
	project: string;
};

export type TmsDraftLoadsData = {
	driver_id: number | string;
	project: string;
	total: number;
	page: number;
	per_page: number;
	total_pages: number;
	loads: TmsDraftLoadRow[];
};

@Injectable()
export class TmsDriverDraftLoadsService {
	private readonly logger = new Logger(TmsDriverDraftLoadsService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Fetches in-progress (draft) loads for a driver from TMS.
	 */
	async fetchDraftLoads(driverExternalId: string): Promise<TmsDraftLoadsData> {
		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			throw new Error('TMS_API_KEY is not configured');
		}

		const baseUrl = this.configService.get<string>(
			'externalApi.tmsDriverLoadsDraftsUrl',
		);
		if (!baseUrl) {
			throw new Error('TMS driver drafts URL is not configured');
		}

		const url = new URL(baseUrl);
		url.searchParams.set('driver_id', driverExternalId.trim());
		url.searchParams.set('project', TMS_DRAFT_LOADS_PROJECT);
		url.searchParams.set('page', '1');
		url.searchParams.set('per_page', '50');

		try {
			const { data } = await axios.get<{
				success?: boolean;
				data?: TmsDraftLoadsData;
			}>(url.toString(), {
				headers: {
					'X-API-Key': apiKey,
					'Content-Type': 'application/json',
				},
				timeout: 30000,
			});

			if (data?.success !== true || data.data == null) {
				this.logger.error(
					`TMS drafts unexpected response: ${JSON.stringify(data)}`,
				);
				throw new Error('TMS returned an invalid draft loads response');
			}

			const d = data.data;
			if (!Array.isArray(d.loads)) {
				d.loads = [];
			}

			return d;
		} catch (error) {
			const ax = error as AxiosError;
			if (ax.response?.data != null) {
				const errBody =
					typeof ax.response.data === 'string'
						? ax.response.data
						: JSON.stringify(ax.response.data, null, 2);
				this.logger.error(`TMS drafts error response: ${errBody}`);
			}
			this.logger.error(
				`TMS drafts failed driver_id=${driverExternalId}: ${ax.message}`,
			);
			throw error;
		}
	}
}
