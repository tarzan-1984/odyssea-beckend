import {
	Injectable,
	Logger,
	OnModuleDestroy,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Browser, chromium } from 'playwright';
import {
	buildHereMapsPointUrl,
	hereRevgeocodeCacheKey,
	parseHereRevgeocodeResponse,
} from './here-revgeocode.util';
import { HereRevgeocodeResult } from './here-revgeocode.types';

const HERE_REVGEOCODE_URL_PART = 'revgeocode.search.hereapi.com/v1/revgeocode';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
	expiresAt: number;
	value: HereRevgeocodeResult | null;
};

@Injectable()
export class HerePlaywrightReverseGeocodeService implements OnModuleDestroy {
	private readonly logger = new Logger(HerePlaywrightReverseGeocodeService.name);
	private readonly cache = new Map<string, CacheEntry>();
	private browser: Browser | null = null;
	private browserLaunchPromise: Promise<Browser> | null = null;
	private activeRequests = 0;
	private readonly queue: Array<{
		task: () => Promise<unknown>;
		resolve: (value: unknown) => void;
		reject: (error: unknown) => void;
	}> = [];
	private drainingQueue = false;

	constructor(private readonly configService: ConfigService) {}

	private get timeoutMs(): number {
		const raw = this.configService.get<string>('HERE_PLAYWRIGHT_TIMEOUT_MS');
		const parsed = raw ? Number.parseInt(raw, 10) : 45000;
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 45000;
	}

	private get defaultZoom(): number {
		const raw = this.configService.get<string>('HERE_MAPS_DEFAULT_ZOOM');
		const parsed = raw ? Number.parseInt(raw, 10) : 16;
		return Number.isFinite(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 16;
	}

	async onModuleDestroy(): Promise<void> {
		if (this.browser) {
			await this.browser.close().catch(() => undefined);
			this.browser = null;
			this.browserLaunchPromise = null;
		}
	}

	private getCached(key: string): HereRevgeocodeResult | null | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return undefined;
		}
		return entry.value;
	}

	private setCached(key: string, value: HereRevgeocodeResult | null): void {
		this.cache.set(key, {
			value,
			expiresAt: Date.now() + CACHE_TTL_MS,
		});
	}

	private async getBrowser(): Promise<Browser> {
		if (this.browser?.isConnected()) {
			return this.browser;
		}

		if (!this.browserLaunchPromise) {
			this.browserLaunchPromise = chromium
				.launch({
					headless: true,
					args: ['--no-sandbox', '--disable-setuid-sandbox'],
				})
				.then((browser) => {
					this.browser = browser;
					return browser;
				})
				.catch((error) => {
					this.browserLaunchPromise = null;
					throw error;
				});
		}

		return this.browserLaunchPromise;
	}

	private async runExclusive<T>(task: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({
				task: task as () => Promise<unknown>,
				resolve: resolve as (value: unknown) => void,
				reject,
			});
			void this.drainQueue();
		});
	}

	private async drainQueue(): Promise<void> {
		if (this.drainingQueue) return;
		this.drainingQueue = true;

		while (this.queue.length > 0) {
			const job = this.queue.shift();
			if (!job) break;
			this.activeRequests += 1;
			try {
				const result = await job.task();
				job.resolve(result);
			} catch (error) {
				job.reject(error);
			} finally {
				this.activeRequests -= 1;
			}
		}

		this.drainingQueue = false;
		if (this.queue.length > 0) {
			void this.drainQueue();
		}
	}

	/**
	 * Opens HERE WeGo for the coordinates and intercepts the internal
	 * `revgeocode.search.hereapi.com/v1/revgeocode` JSON response.
	 */
	async reverseGeocode(
		latitude: number,
		longitude: number,
	): Promise<HereRevgeocodeResult | null> {
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
			return null;
		}

		const cacheKey = hereRevgeocodeCacheKey(latitude, longitude);
		const cached = this.getCached(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		return this.runExclusive(async () => {
			const cachedAgain = this.getCached(cacheKey);
			if (cachedAgain !== undefined) {
				return cachedAgain;
			}

			const result = await this.fetchViaPlaywright(latitude, longitude);
			this.setCached(cacheKey, result);
			return result;
		});
	}

	private async fetchViaPlaywright(
		latitude: number,
		longitude: number,
	): Promise<HereRevgeocodeResult | null> {
		let browser: Browser;
		try {
			browser = await this.getBrowser();
		} catch (error) {
			this.logger.error(
				'Playwright browser launch failed. Run: npx playwright install chromium',
				error,
			);
			throw new ServiceUnavailableException(
				'HERE reverse geocode browser is not available',
			);
		}

		const page = await browser.newPage({
			userAgent:
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		});

		try {
			const responsePromise = page.waitForResponse(
				(response) =>
					response.url().includes(HERE_REVGEOCODE_URL_PART) &&
					response.status() === 200,
				{ timeout: this.timeoutMs },
			);

			const mapsUrl = buildHereMapsPointUrl(
				latitude,
				longitude,
				this.defaultZoom,
			);
			this.logger.debug(`HERE Playwright navigating to ${mapsUrl}`);

			await page.goto(mapsUrl, {
				waitUntil: 'domcontentloaded',
				timeout: this.timeoutMs,
			});

			const response = await responsePromise;
			const json: unknown = await response.json();
			const parsed = parseHereRevgeocodeResponse(json);

			if (!parsed) {
				this.logger.warn(
					`HERE revgeocode response had no usable address for ${latitude},${longitude}`,
				);
			}

			return parsed;
		} catch (error) {
			this.logger.warn(
				`HERE Playwright reverse geocode failed for ${latitude},${longitude}`,
				error,
			);
			return null;
		} finally {
			await page.close().catch(() => undefined);
		}
	}
}
