import { Injectable, Logger } from '@nestjs/common';
import { GeoPrismaService } from '../prisma/geo-prisma.service';
import { inferNorthAmericaCountrySearchOrder } from './north-america-country.util';
import {
	GeoPostgisReverseGeocodeResult,
	GeoPostgisReverseGeocodeRow,
} from './geo-postgis-reverse-geocode.types';

/** KNN search radii in degrees (~0.25° ≈ 28 km at mid-latitudes). */
const NEAREST_EXPAND_DEGREES = [0.25, 1.0, 3.0] as const;

@Injectable()
export class GeoPostgisReverseGeocodeService {
	private readonly logger = new Logger(GeoPostgisReverseGeocodeService.name);
	private unavailableUntilMs = 0;

	constructor(private readonly geoPrisma: GeoPrismaService) {}

	async reverseGeocode(
		latitude: number,
		longitude: number,
	): Promise<GeoPostgisReverseGeocodeResult | null> {
		if (Date.now() < this.unavailableUntilMs) {
			return null;
		}

		if (!this.geoPrisma.isConnected) {
			this.logger.warn('Geo database is not connected — reverse geocode skipped');
			return null;
		}

		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
			return null;
		}

		try {
			const countries = inferNorthAmericaCountrySearchOrder({
				latitude,
				longitude,
			});

			for (const countryCode of countries) {
				const containsRows = await this.queryContains(
					latitude,
					longitude,
					countryCode,
				);
				const containsMatch = this.toResult(containsRows[0], 'contains');
				if (containsMatch) {
					return containsMatch;
				}
			}

			for (const expandDegrees of NEAREST_EXPAND_DEGREES) {
				for (const countryCode of countries) {
					const nearestRows = await this.queryNearest(
						latitude,
						longitude,
						countryCode,
						expandDegrees,
					);
					const nearestMatch = this.toResult(nearestRows[0], 'nearest');
					if (nearestMatch) {
						return nearestMatch;
					}
				}
			}

			const fallbackRows = await this.geoPrisma.$queryRaw<
				GeoPostgisReverseGeocodeRow[]
			>`
				SELECT city, state, state_code, zip, country_code
				FROM geo_zips
				ORDER BY geom <-> ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)
				LIMIT 1
			`;

			return this.toResult(fallbackRows[0], 'nearest');
		} catch (error) {
			this.unavailableUntilMs = Date.now() + 30_000;
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(
				`Geo database reverse geocode failed; skipping PostGIS for 30s: ${message}`,
			);
			return null;
		}
	}

	private queryContains(
		latitude: number,
		longitude: number,
		countryCode: string,
	): Promise<GeoPostgisReverseGeocodeRow[]> {
		return this.geoPrisma.$queryRaw<GeoPostgisReverseGeocodeRow[]>`
			SELECT city, state, state_code, zip, country_code
			FROM geo_zips
			WHERE country_code = ${countryCode}
			  AND ST_Contains(
			    geom,
			    ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)
			  )
			LIMIT 1
		`;
	}

	private queryNearest(
		latitude: number,
		longitude: number,
		countryCode: string,
		expandDegrees: number,
	): Promise<GeoPostgisReverseGeocodeRow[]> {
		return this.geoPrisma.$queryRaw<GeoPostgisReverseGeocodeRow[]>`
			SELECT city, state, state_code, zip, country_code
			FROM geo_zips
			WHERE country_code = ${countryCode}
			  AND geom && ST_Expand(
			    ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326),
			    ${expandDegrees}
			  )
			ORDER BY geom <-> ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)
			LIMIT 1
		`;
	}

	private toResult(
		row: GeoPostgisReverseGeocodeRow | undefined,
		match: GeoPostgisReverseGeocodeResult['match'],
	): GeoPostgisReverseGeocodeResult | null {
		if (!row) {
			return null;
		}

		const zip = row.zip?.trim() ?? '';
		const city = row.city?.trim() ?? '';
		const state = row.state?.trim() ?? '';
		const stateCode = row.state_code?.trim() ?? '';
		const countryCode = row.country_code?.trim() ?? '';

		if (!zip && !city && !state && !stateCode && !countryCode) {
			return null;
		}

		return { city, state, stateCode, zip, countryCode, match };
	}
}
