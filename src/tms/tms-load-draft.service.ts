import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AxiosError } from '../types/request.types';

export type TmsLoadDraftRoutePoint = {
	type: 'pick_up_location' | 'delivery_location' | string;
	location: string;
	local_date: string;
	time_start: string;
	time_end: string;
	eta_date?: string;
	eta_time?: string;
};

export type TmsLoadDraftPayload = {
	project: string;
	user_id: number;
	driver_id: number | string;
	offer_id: string;
	commodity: string;
	notes: string;
	weight: number;
	rate: number;
	empty_miles: number;
	loaded_miles: number;
	special_requirements: string[];
	route: TmsLoadDraftRoutePoint[];
};

@Injectable()
export class TmsLoadDraftService {
	private readonly logger = new Logger(TmsLoadDraftService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Creates a load draft in TMS. Throws on HTTP/network errors or invalid response.
	 */
	async createLoadDraft(payload: TmsLoadDraftPayload): Promise<number> {
		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			throw new Error('TMS_API_KEY is not configured');
		}

		const url = this.configService.get<string>(
			'externalApi.tmsLoadDraftCreateUrl',
		);
		if (!url) {
			throw new Error('TMS load draft URL is not configured');
		}

		try {
			const { data } = await axios.post<
				| {
						success?: boolean;
						data?: { post_id?: number };
				  }
				| undefined
			>(url, payload, {
				headers: {
					'X-API-Key': apiKey,
					'Content-Type': 'application/json',
				},
				timeout: 30000,
			});

			console.log(
				'[TmsLoadDraftService] TMS load/draft/create response:',
				JSON.stringify(data, null, 2),
			);

			const postId = data?.data?.post_id;
			if (
				data?.success !== true ||
				typeof postId !== 'number' ||
				!Number.isFinite(postId)
			) {
				this.logger.error(
					`TMS load/draft/create unexpected response: ${JSON.stringify(data)}`,
				);
				throw new Error('TMS returned an invalid response (missing post_id)');
			}

			this.logger.log(
				`TMS load/draft/create ok post_id=${postId} offer_id=${payload.offer_id}`,
			);
			return postId;
		} catch (error) {
			const ax = error as AxiosError;
			if (ax.response?.data != null) {
				const errBody =
					typeof ax.response.data === 'string'
						? ax.response.data
						: JSON.stringify(ax.response.data, null, 2);
				console.log(
					'[TmsLoadDraftService] TMS load/draft/create error response:',
					errBody,
				);
			}
			const detail =
				ax.response?.data != null
					? JSON.stringify(ax.response.data)
					: ax.message;
			this.logger.error(
				`TMS load/draft/create failed offer_id=${payload.offer_id}: ${detail}`,
			);
			throw error;
		}
	}
}
