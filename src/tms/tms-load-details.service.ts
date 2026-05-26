import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { ExternalApiConfig } from '../config/env.config';
import { AxiosError } from '../types/request.types';
import { logTrackingLoadPage } from './tracking-load-page.logger';

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

		logTrackingLoadPage(this.logger, 'TMS fetchLoadDetails started', {
			loadId: trimmedLoadId,
		});

		if (!trimmedLoadId) {
			logTrackingLoadPage(this.logger, 'TMS STOP — empty loadId', {});
			return null;
		}

		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			logTrackingLoadPage(this.logger, 'TMS STOP — TMS_API_KEY not configured', {
				loadId: trimmedLoadId,
			});
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

		logTrackingLoadPage(this.logger, 'TMS calling external API', {
			loadId: trimmedLoadId,
			url: url.toString(),
			hasApiKey: Boolean(apiKey?.trim()),
			apiKeyLength: apiKey?.length ?? 0,
			baseUrl,
		});

		try {
			const { data, status } = await axios.get<TmsLoadDetailsResponse>(url.toString(), {
				headers: {
					'X-API-Key': apiKey,
					'Content-Type': 'application/json',
				},
				timeout: 30000,
				validateStatus: () => true,
			});

			logTrackingLoadPage(this.logger, 'TMS external API response', {
				loadId: trimmedLoadId,
				httpStatus: status,
				success: data?.success,
				hasData: Boolean(data?.data),
				hasMeta: Boolean(data?.data?.meta_data),
			});

			if (status >= 400) {
				logTrackingLoadPage(this.logger, 'TMS STOP — HTTP error from TMS', {
					loadId: trimmedLoadId,
					httpStatus: status,
				});
				return null;
			}

			if (!data?.data) {
				logTrackingLoadPage(this.logger, 'TMS STOP — 200 but empty data', {
					loadId: trimmedLoadId,
				});
				return data ?? null;
			}

			logTrackingLoadPage(this.logger, 'TMS fetchLoadDetails OK', {
				loadId: trimmedLoadId,
			});

			return data;
		} catch (error) {
			const ax = error as AxiosError;
			if (ax.response?.data != null) {
				const errBody =
					typeof ax.response.data === 'string'
						? ax.response.data
						: JSON.stringify(ax.response.data, null, 2);
				logTrackingLoadPage(this.logger, 'TMS STOP — axios error body', {
					loadId: trimmedLoadId,
					bodyPreview: errBody.slice(0, 500),
				});
			}
			logTrackingLoadPage(this.logger, 'TMS STOP — axios exception', {
				loadId: trimmedLoadId,
				message: ax.message,
				code: ax.code,
			});
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
