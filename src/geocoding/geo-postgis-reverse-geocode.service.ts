import { Injectable, Logger } from '@nestjs/common';
import { GeoPrismaService } from '../prisma/geo-prisma.service';
import {
	GeoPostgisReverseGeocodeResult,
	GeoPostgisReverseGeocodeRow,
} from './geo-postgis-reverse-geocode.types';

@Injectable()
export class GeoPostgisReverseGeocodeService {
	private readonly logger = new Logger(GeoPostgisReverseGeocodeService.name);

	constructor(private readonly geoPrisma: GeoPrismaService) {}

	async reverseGeocode(
		latitude: number,
		longitude: number,
	): Promise<GeoPostgisReverseGeocodeResult | null> {
		if (!this.geoPrisma.isConnected) {
			this.logger.warn('Geo database is not connected — reverse geocode skipped');
			return null;
		}

		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
			return null;
		}

		const containsRows = await this.geoPrisma.$queryRaw<GeoPostgisReverseGeocodeRow[]>`
			SELECT city, state, state_code, zip, country_code
			FROM geo_zips
			WHERE ST_Contains(
				geom,
				ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)
			)
			LIMIT 1
		`;

		const containsMatch = this.toResult(containsRows[0], 'contains');
		if (containsMatch) {
			return containsMatch;
		}

		const nearestRows = await this.geoPrisma.$queryRaw<GeoPostgisReverseGeocodeRow[]>`
			SELECT city, state, state_code, zip, country_code
			FROM geo_zips
			ORDER BY geom <-> ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)
			LIMIT 1
		`;

		return this.toResult(nearestRows[0], 'nearest');
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
