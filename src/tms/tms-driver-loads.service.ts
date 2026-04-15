import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AxiosError } from '../types/request.types';
import type { ExternalApiConfig } from '../config/env.config';
import { GetDriverLoadsDto } from './dto/get-driver-loads.dto';

@Injectable()
export class TmsDriverLoadsService {
	private readonly logger = new Logger(TmsDriverLoadsService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Proxies TMS GET /driver/loads. All query params are forwarded from the mobile app.
	 * We do not hardcode parameter values; only validate/whitelist keys via DTO.
	 */
	async fetchDriverLoads(query: GetDriverLoadsDto): Promise<unknown> {
		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			throw new Error('TMS_API_KEY is not configured');
		}

		const baseUrl =
			this.configService.get<string>('externalApi.tmsDriverLoadsUrl') ||
			(this.configService.get<ExternalApiConfig>('externalApi')
				?.tmsDriverLoadsUrl as string | undefined);
		if (!baseUrl) {
			throw new Error('TMS driver loads URL is not configured');
		}

		const url = new URL(baseUrl);
		const params: Record<string, string | undefined> = {
			driver_id: query.driver_id?.trim(),
			user_id: query.user_id?.trim(),
			project: query.project?.trim(),
			is_flt: query.is_flt?.trim(),
			load_status: query.load_status?.trim(),
			sort_by: query.sort_by?.trim(),
			sort_order: query.sort_order?.trim(),
			page: query.page?.trim(),
			per_page: query.per_page?.trim(),
		};
		for (const [k, v] of Object.entries(params)) {
			if (v != null && v !== '') {
				url.searchParams.set(k, v);
			}
		}

		try {
			const { data } = await axios.get(url.toString(), {
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
				this.logger.error(`TMS driver loads error response: ${errBody}`);
			}
			this.logger.error(
				`TMS driver loads failed: ${ax.message} url=${url.toString()}`,
			);
			throw error;
		}
	}
}

