import { Injectable, Logger } from '@nestjs/common';
import { GeoPrismaService } from '../prisma/geo-prisma.service';
import { geoReverseCacheGridCell } from './geo-reverse-cache-grid.util';
import { DriverReverseGeocodeResult } from './driver-reverse-geocode.types';

type GeoReverseCacheRow = {
	city: string | null;
	state: string | null;
	state_code: string | null;
	zip: string | null;
	country_code: string | null;
	source: string | null;
};

@Injectable()
export class GeoReverseCacheService {
	private readonly logger = new Logger(GeoReverseCacheService.name);
	private unavailableUntilMs = 0;

	constructor(private readonly geoPrisma: GeoPrismaService) {}

	async findByCoordinates(
		latitude: number,
		longitude: number,
	): Promise<DriverReverseGeocodeResult | null> {
		if (Date.now() < this.unavailableUntilMs) {
			return null;
		}

		if (!this.geoPrisma.isConnected) {
			return null;
		}

		const cell = geoReverseCacheGridCell(latitude, longitude);
		try {
			const rows = await this.geoPrisma.$queryRaw<GeoReverseCacheRow[]>`
				SELECT city, state, state_code, zip, country_code, source
				FROM geo_reverse_cache
				WHERE grid_lat = ${cell.gridLat}
				  AND grid_lng = ${cell.gridLng}
				LIMIT 1
			`;

			return this.toResult(rows[0], 'geo_reverse_cache');
		} catch (error) {
			this.unavailableUntilMs = Date.now() + 30_000;
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(
				`Geo reverse cache lookup failed; skipping geo DB cache for 30s: ${message}`,
			);
			return null;
		}
	}

	async upsertFromReverseGeocode(
		latitude: number,
		longitude: number,
		result: DriverReverseGeocodeResult,
		source: string,
	): Promise<void> {
		if (Date.now() < this.unavailableUntilMs) {
			return;
		}

		if (!this.geoPrisma.isConnected) {
			return;
		}

		const cell = geoReverseCacheGridCell(latitude, longitude);
		try {
			await this.geoPrisma.$executeRaw`
				INSERT INTO geo_reverse_cache (
					grid_lat,
					grid_lng,
					center_lat,
					center_lng,
					city,
					state,
					state_code,
					zip,
					country_code,
					source
				)
				VALUES (
					${cell.gridLat},
					${cell.gridLng},
					${cell.centerLat},
					${cell.centerLng},
					${result.city || null},
					${result.state || null},
					${result.stateCode || null},
					${result.zip || null},
					${result.countryCode || null},
					${source}
				)
				ON CONFLICT (grid_lat, grid_lng)
				DO UPDATE SET
					center_lat = EXCLUDED.center_lat,
					center_lng = EXCLUDED.center_lng,
					city = EXCLUDED.city,
					state = EXCLUDED.state,
					state_code = EXCLUDED.state_code,
					zip = EXCLUDED.zip,
					country_code = EXCLUDED.country_code,
					source = EXCLUDED.source,
					created_at = NOW()
			`;
		} catch (error) {
			this.unavailableUntilMs = Date.now() + 30_000;
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(
				`Geo reverse cache write failed; skipping geo DB cache for 30s: ${message}`,
			);
			return;
		}

		this.logger.log(
			`Cached reverse geocode for grid ${cell.gridLat},${cell.gridLng} (${source})`,
		);
	}

	private toResult(
		row: GeoReverseCacheRow | undefined,
		source: DriverReverseGeocodeResult['source'],
	): DriverReverseGeocodeResult | null {
		if (!row) {
			return null;
		}

		const city = row.city?.trim() ?? '';
		const state = row.state?.trim() ?? '';
		const stateCode = row.state_code?.trim() ?? '';
		const zip = row.zip?.trim() ?? '';
		const countryCode = row.country_code?.trim() ?? '';

		if (!city && !state && !stateCode && !zip && !countryCode) {
			return null;
		}

		return { city, state, stateCode, zip, countryCode, source };
	}
}
