import {
	BadRequestException,
	Injectable,
	Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { ExternalApiConfig } from '../config/env.config';
import { PrismaService } from '../prisma/prisma.service';
import { AxiosError } from '../types/request.types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
	loadIds: string[];
	expiresAt: number;
};

export type TrackingTeamsResult = {
	loadIds: string[];
	total: number;
	cached: boolean;
};

@Injectable()
export class TrackingTeamsService {
	private readonly logger = new Logger(TrackingTeamsService.name);
	/** Cache key: `${externalId}:${includeSubordinates ? 1 : 0}` */
	private readonly cache = new Map<string, CacheEntry>();

	constructor(
		private readonly configService: ConfigService,
		private readonly prisma: PrismaService,
	) {}

	private cacheKey(externalId: string, includeSubordinates: boolean): string {
		return `${externalId}:${includeSubordinates ? 1 : 0}`;
	}

	/**
	 * Drop cached TMS teams lists for the given internal user ids (both mine + team keys).
	 */
	async invalidateForUserIds(userIds: string[]): Promise<void> {
		const uniqueIds = [
			...new Set(
				userIds.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0),
			),
		];
		if (uniqueIds.length === 0) return;

		const users = await this.prisma.user.findMany({
			where: { id: { in: uniqueIds } },
			select: { externalId: true },
		});

		for (const user of users) {
			const externalId = user.externalId?.trim();
			if (!externalId) continue;
			this.cache.delete(this.cacheKey(externalId, false));
			this.cache.delete(this.cacheKey(externalId, true));
		}
	}

	async getLoadIdsForUser(
		userId: string,
		includeSubordinates: boolean,
		options?: { bypassCache?: boolean },
	): Promise<TrackingTeamsResult> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { externalId: true },
		});
		const externalId = user?.externalId?.trim();
		if (!externalId) {
			throw new BadRequestException('User has no externalId');
		}

		const key = this.cacheKey(externalId, includeSubordinates);
		if (!options?.bypassCache) {
			const hit = this.cache.get(key);
			if (hit && hit.expiresAt > Date.now()) {
				return {
					loadIds: hit.loadIds,
					total: hit.loadIds.length,
					cached: true,
				};
			}
		}

		const loadIds = await this.fetchFromTms(externalId, includeSubordinates);
		this.cache.set(key, {
			loadIds,
			expiresAt: Date.now() + CACHE_TTL_MS,
		});

		return {
			loadIds,
			total: loadIds.length,
			cached: false,
		};
	}

	private async fetchFromTms(
		externalId: string,
		includeSubordinates: boolean,
	): Promise<string[]> {
		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			throw new Error('TMS_API_KEY is not configured');
		}

		const baseUrl =
			this.configService.get<string>('externalApi.tmsTrackingTeamsUrl') ||
			(this.configService.get<ExternalApiConfig>('externalApi')
				?.tmsTrackingTeamsUrl as string | undefined);
		if (!baseUrl) {
			throw new Error('TMS tracking teams URL is not configured');
		}

		const url = new URL(baseUrl);
		url.searchParams.set('user_id', externalId);
		url.searchParams.set('project', 'odysseia');
		if (includeSubordinates) {
			url.searchParams.set('include_subordinates', '1');
		}

		try {
			const { data } = await axios.get(url.toString(), {
				headers: {
					'X-API-Key': apiKey,
					'Content-Type': 'application/json',
				},
				timeout: 30000,
			});

			const rawIds = data?.data?.load_ids;
			if (!Array.isArray(rawIds)) {
				this.logger.warn(
					`TMS tracking/teams unexpected payload for user_id=${externalId}`,
				);
				return [];
			}

			return rawIds
				.map((id: unknown) => String(id ?? '').trim())
				.filter((id: string) => id.length > 0);
		} catch (error) {
			const ax = error as AxiosError;
			if (ax.response?.data != null) {
				const errBody =
					typeof ax.response.data === 'string'
						? ax.response.data
						: JSON.stringify(ax.response.data, null, 2);
				this.logger.error(`TMS tracking/teams error response: ${errBody}`);
			}
			this.logger.error(
				`TMS tracking/teams failed: ${ax.message} url=${url.toString()}`,
			);
			throw error;
		}
	}
}
