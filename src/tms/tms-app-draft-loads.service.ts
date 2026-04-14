import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AxiosError } from '../types/request.types';
import {
	TMS_DRAFT_LOADS_PROJECT,
	type TmsDraftLoadsData,
} from './tms-driver-draft-loads.service';

/** TMS list payload for GET /loads/drafts (user_id) — shape matches driver drafts list where possible */
export type TmsAppDraftLoadsData = Omit<TmsDraftLoadsData, 'driver_id'> & {
	user_id?: number | string;
	driver_id?: number | string;
};

@Injectable()
export class TmsAppDraftLoadsService {
	private readonly logger = new Logger(TmsAppDraftLoadsService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Fetches draft loads for a TMS user (non-driver app roles).
	 * Query: user_id, project=odysseia, is_flt=false, page, per_page=100
	 */
	async fetchDraftLoadsForUser(tmsUserId: string): Promise<TmsAppDraftLoadsData> {
		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			throw new Error('TMS_API_KEY is not configured');
		}

		const baseUrl = this.configService.get<string>('externalApi.tmsLoadsDraftsUrl');
		if (!baseUrl) {
			throw new Error('TMS loads drafts URL is not configured');
		}

		const url = new URL(baseUrl);
		url.searchParams.set('user_id', tmsUserId.trim());
		url.searchParams.set('project', TMS_DRAFT_LOADS_PROJECT);
		url.searchParams.set('is_flt', 'false');
		url.searchParams.set('page', '1');
		url.searchParams.set('per_page', '100');

		try {
			const { data } = await axios.get<{
				success?: boolean;
				data?: TmsAppDraftLoadsData;
			}>(url.toString(), {
				headers: {
					'X-API-Key': apiKey,
					'Content-Type': 'application/json',
				},
				timeout: 30000,
			});

			if (data?.success !== true || data.data == null) {
				this.logger.error(
					`TMS app drafts unexpected response: ${JSON.stringify(data)}`,
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
				this.logger.error(`TMS app drafts error response: ${errBody}`);
			}
			this.logger.error(
				`TMS app drafts failed user_id=${tmsUserId}: ${ax.message}`,
			);
			throw error;
		}
	}
}
