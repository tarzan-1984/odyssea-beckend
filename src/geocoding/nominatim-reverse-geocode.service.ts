import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
	NominatimReverseAddress,
	parseNominatimReverseResponse,
	reverseGeocodeCacheKey,
} from './nominatim-reverse-geocode.util';

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

type CacheEntry = {
	expiresAt: number;
	value: NominatimReverseAddress | null;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class NominatimReverseGeocodeService {
	private readonly logger = new Logger(NominatimReverseGeocodeService.name);
	private readonly cache = new Map<string, CacheEntry>();
	private lastRequestFinishedAt = 0;

	constructor(private readonly configService: ConfigService) {}

	private userAgent(): string {
		return (
			this.configService.get<string>('OSM_GEOCODER_USER_AGENT') ||
			'OdysseaBackend/1.0 (+https://odysseia.com; driver location reverse geocoding)'
		);
	}

	private async throttle(): Promise<void> {
		const elapsed = Date.now() - this.lastRequestFinishedAt;
		if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
			await sleep(NOMINATIM_MIN_INTERVAL_MS - elapsed);
		}
	}

	private getCached(key: string): NominatimReverseAddress | null | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			return undefined;
		}
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return undefined;
		}
		return entry.value;
	}

	private setCached(key: string, value: NominatimReverseAddress | null): void {
		this.cache.set(key, {
			value,
			expiresAt: Date.now() + CACHE_TTL_MS,
		});
	}

	/**
	 * Reverse geocode lat/lng via OSM Nominatim (English labels).
	 * Returns null on HTTP error, rate limit, timeout, or empty address.
	 */
	async reverseGeocode(
		latitude: number,
		longitude: number,
	): Promise<NominatimReverseAddress | null> {
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
			return null;
		}

		const cacheKey = reverseGeocodeCacheKey(latitude, longitude);
		const cached = this.getCached(cacheKey);
		if (cached !== undefined) {
			this.logger.debug(
				`[ServerGeocode][Nominatim] Cache hit lat=${latitude.toFixed(4)} lon=${longitude.toFixed(4)}`,
			);
			return cached;
		}

		const url = new URL(NOMINATIM_REVERSE);
		url.searchParams.set('format', 'json');
		url.searchParams.set('lat', String(latitude));
		url.searchParams.set('lon', String(longitude));
		url.searchParams.set('addressdetails', '1');
		url.searchParams.set('accept-language', 'en');

		await this.throttle();

		try {
			const { status, data } = await axios.get<unknown>(url.toString(), {
				timeout: REQUEST_TIMEOUT_MS,
				headers: {
					'User-Agent': this.userAgent(),
					'Accept-Language': 'en',
					Accept: 'application/json',
				},
				validateStatus: () => true,
			});

			this.lastRequestFinishedAt = Date.now();

			if (status < 200 || status >= 300) {
				this.logger.warn(
					`[ServerGeocode][Nominatim] HTTP ${status} — no address (lat=${latitude.toFixed(6)} lon=${longitude.toFixed(6)})`,
				);
				this.setCached(cacheKey, null);
				return null;
			}

			const parsed = parseNominatimReverseResponse(data);
			if (!parsed) {
				this.logger.warn(
					`[ServerGeocode][Nominatim] Empty address in response (lat=${latitude.toFixed(6)} lon=${longitude.toFixed(6)})`,
				);
				this.setCached(cacheKey, null);
				return null;
			}

			this.logger.log(
				`[ServerGeocode][Nominatim] OK — city="${parsed.city}" state="${parsed.state}" zip="${parsed.zip}"`,
			);
			this.setCached(cacheKey, parsed);
			return parsed;
		} catch (error: unknown) {
			this.lastRequestFinishedAt = Date.now();
			const msg = error instanceof Error ? error.message : String(error);
			this.logger.warn(
				`[ServerGeocode][Nominatim] Request failed: ${msg} (lat=${latitude.toFixed(6)} lon=${longitude.toFixed(6)})`,
			);
			return null;
		}
	}
}
