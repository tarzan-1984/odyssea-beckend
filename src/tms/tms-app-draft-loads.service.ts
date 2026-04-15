import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AxiosError } from '../types/request.types';
import type { TmsDraftLoadRow } from './tms-driver-draft-loads.service';

/** Normalized list shape consumed by OffersService (same as driver drafts list). */
export type TmsAppDraftLoadsData = {
	user_id: string;
	project: string;
	total: number;
	page: number;
	per_page: number;
	total_pages: number;
	loads: TmsDraftLoadRow[];
};

type TmsLoadsDraftsApiEnvelope = {
	success?: boolean;
	data?: {
		loads?: unknown[];
		total_items?: number;
		total_pages?: number;
	};
	pagination?: {
		current_page?: number;
		per_page?: number;
		total_pages?: number;
		total_items?: number;
	};
};

function tryParseJsonArray(value: unknown): Array<Record<string, unknown>> {
	if (typeof value !== 'string' || !value.trim()) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(x): x is Record<string, unknown> =>
				x != null && typeof x === 'object' && !Array.isArray(x),
		);
	} catch {
		return [];
	}
}

function firstDateFromLocationJson(jsonStr: unknown): string {
	const arr = tryParseJsonArray(jsonStr);
	const d = arr[0]?.date;
	return d != null ? String(d).trim() : '';
}

/**
 * Maps TMS GET /loads/drafts row (id + meta_data) into the same row shape as driver /drafts.
 */
function mapStaffLoadToDraftRow(
	raw: Record<string, unknown>,
	project: string,
): TmsDraftLoadRow {
	const meta =
		raw.meta_data != null && typeof raw.meta_data === 'object' && !Array.isArray(raw.meta_data)
			? (raw.meta_data as Record<string, unknown>)
			: {};

	const idRaw = raw.id;
	const idNum =
		typeof idRaw === 'number'
			? idRaw
			: typeof idRaw === 'string'
				? parseInt(idRaw.trim(), 10)
				: NaN;

	return {
		id: Number.isFinite(idNum) ? idNum : 0,
		date_created: String(raw.date_created ?? ''),
		date_updated: String(raw.date_updated ?? ''),
		pick_up_date: firstDateFromLocationJson(meta.pick_up_location),
		delivery_date: firstDateFromLocationJson(meta.delivery_location),
		offer_id: meta.offer_id != null ? String(meta.offer_id).trim() : '',
		project,
	};
}

@Injectable()
export class TmsAppDraftLoadsService {
	private readonly logger = new Logger(TmsAppDraftLoadsService.name);

	constructor(private readonly configService: ConfigService) {}

	/**
	 * Fetches draft loads for a TMS user (non-driver app roles).
	 * Query: user_id, project, is_flt, page, per_page
	 *
	 * TMS returns a different JSON shape than driver /drafts; we normalize to {@link TmsDraftLoadRow}.
	 */
	async fetchDraftLoadsForUser(
		tmsUserId: string,
		query: { project: string; page?: number; per_page?: number; is_flt?: string },
	): Promise<TmsAppDraftLoadsData> {
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
		url.searchParams.set('project', String(query.project).trim());
		if (query.is_flt != null) {
			url.searchParams.set('is_flt', String(query.is_flt).trim());
		}
		if (query.page != null) {
			url.searchParams.set('page', String(query.page));
		}
		if (query.per_page != null) {
			url.searchParams.set('per_page', String(query.per_page));
		}

		try {
			const { data } = await axios.get<TmsLoadsDraftsApiEnvelope>(url.toString(), {
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

			const inner = data.data;
			const rawLoads = Array.isArray(inner.loads) ? inner.loads : [];
			const pagination = data.pagination ?? {};

			const total =
				typeof inner.total_items === 'number'
					? inner.total_items
					: typeof pagination.total_items === 'number'
						? pagination.total_items
						: rawLoads.length;
			const totalPages =
				typeof inner.total_pages === 'number'
					? inner.total_pages
					: typeof pagination.total_pages === 'number'
						? pagination.total_pages
						: 1;
			// Root `pagination` matches GET /loads/drafts; fall back to request query if omitted.
			const pageFromResponse =
				typeof pagination.current_page === 'number' ? pagination.current_page : undefined;
			const page =
				pageFromResponse ??
				(typeof query.page === 'number' && query.page >= 1 ? query.page : 1);
			const perPageFromResponse =
				typeof pagination.per_page === 'number' ? pagination.per_page : undefined;
			const perPage =
				perPageFromResponse ??
				(typeof query.per_page === 'number' && query.per_page >= 1
					? query.per_page
					: 100);

			const loads: TmsDraftLoadRow[] = rawLoads
				.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
				.map((row) => mapStaffLoadToDraftRow(row, String(query.project).trim()));

			return {
				user_id: tmsUserId.trim(),
				project: String(query.project).trim(),
				total,
				page,
				per_page: perPage,
				total_pages: totalPages,
				loads,
			};
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
