import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { ExternalApiConfig } from '../config/env.config';
import { AxiosError } from '../types/request.types';

export type TmsLoadRouteLocations = {
	pick_up_location: string | null;
	delivery_location: string | null;
};

export type TmsLoadDetailsResponse = {
	success?: boolean;
	data?: {
		meta_data?: {
			pick_up_location?: unknown;
			delivery_location?: unknown;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

@Injectable()
export class TmsLoadDetailsService {
	private readonly logger = new Logger(TmsLoadDetailsService.name);

	constructor(private readonly configService: ConfigService) {}

	async fetchLoadDetails(loadId: string): Promise<TmsLoadDetailsResponse | null> {
		const trimmedLoadId = loadId.trim();
		if (!trimmedLoadId) return null;

		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			this.logger.warn('TMS load details skipped: TMS_API_KEY is not configured');
			return null;
		}

		const externalApi =
			this.configService.get<ExternalApiConfig>('externalApi');
		const baseUrl =
			externalApi?.tmsLoadDetailsBaseUrl ||
			'https://www.endurance-tms.com/wp-json/tms/v1/load';
		const url = new URL(`${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(trimmedLoadId)}`);
		url.searchParams.set('project', 'odysseia');
		url.searchParams.set('is_flt', 'false');

		try {
			const { data } = await axios.get<TmsLoadDetailsResponse>(url.toString(), {
				headers: {
					'X-API-Key': apiKey,
					'Content-Type': 'application/json',
				},
				timeout: 30000,
			});

			return data;
		} catch (error) {
			const ax = error as AxiosError;
			if (ax.response?.data != null) {
				const errBody =
					typeof ax.response.data === 'string'
						? ax.response.data
						: JSON.stringify(ax.response.data, null, 2);
				this.logger.warn(`TMS load details error response: ${errBody}`);
			}
			this.logger.warn(
				`TMS load details failed load_id=${trimmedLoadId}: ${ax.message}`,
			);
			return null;
		}
	}

	async fetchRouteLocations(loadId: string): Promise<TmsLoadRouteLocations | null> {
		const data = await this.fetchLoadDetails(loadId);
		const meta = data?.data?.meta_data;
		if (!meta) return null;

		const pickUp =
			typeof meta.pick_up_location === 'string'
				? meta.pick_up_location
				: meta.pick_up_location != null
					? JSON.stringify(meta.pick_up_location)
					: null;
		const delivery =
			typeof meta.delivery_location === 'string'
				? meta.delivery_location
				: meta.delivery_location != null
					? JSON.stringify(meta.delivery_location)
					: null;

		return {
			pick_up_location: pickUp,
			delivery_location: delivery,
		};
	}
}
