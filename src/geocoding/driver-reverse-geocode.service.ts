import { Injectable, Logger } from '@nestjs/common';
import { DriverReverseGeocodeResult } from './driver-reverse-geocode.types';
import { GeoPostgisReverseGeocodeService } from './geo-postgis-reverse-geocode.service';
import { GeoReverseCacheService } from './geo-reverse-cache.service';
import { HerePlaywrightReverseGeocodeService } from './here-playwright-reverse-geocode.service';
import { NominatimReverseGeocodeService } from './nominatim-reverse-geocode.service';
import { isAllowedNorthAmericaLatLng } from './north-america-bbox.util';
import { formatServerGeocodeResolvedLog } from './driver-location-save-log.util';

@Injectable()
export class DriverReverseGeocodeService {
	private readonly logger = new Logger(DriverReverseGeocodeService.name);

	constructor(
		private readonly geoPostgisReverseGeocode: GeoPostgisReverseGeocodeService,
		private readonly geoReverseCache: GeoReverseCacheService,
		private readonly hereReverseGeocode: HerePlaywrightReverseGeocodeService,
		private readonly nominatimReverseGeocode: NominatimReverseGeocodeService,
	) {}

	async reverseGeocode(
		latitude: number,
		longitude: number,
	): Promise<DriverReverseGeocodeResult | null> {
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
			return null;
		}

		if (
			!isAllowedNorthAmericaLatLng({ latitude, longitude })
		) {
			return this.reverseGeocodeOutsideNorthAmerica(latitude, longitude);
		}

		return this.reverseGeocodeNorthAmerica(latitude, longitude);
	}

	/** Dev/test abroad: Nominatim only — no geo_reverse_cache read/write outside NA. */
	private async reverseGeocodeOutsideNorthAmerica(
		latitude: number,
		longitude: number,
	): Promise<DriverReverseGeocodeResult | null> {
		const nominatim = await this.nominatimReverseGeocode.reverseGeocode(
			latitude,
			longitude,
		);
		if (!nominatim) {
			return null;
		}

		this.logger.log(
			formatServerGeocodeResolvedLog(
				`Nominatim (outside North America) country=${nominatim.country}`,
				latitude,
				longitude,
				{
					city: nominatim.city,
					state: nominatim.state,
					stateCode: '',
					zip: nominatim.zip,
				},
			),
		);
		return {
			city: nominatim.city,
			state: nominatim.state,
			stateCode: '',
			zip: nominatim.zip,
			countryCode: nominatim.country,
			source: 'nominatim',
		};
	}

	private async reverseGeocodeNorthAmerica(
		latitude: number,
		longitude: number,
	): Promise<DriverReverseGeocodeResult | null> {
		const postgis = await this.geoPostgisReverseGeocode.reverseGeocode(
			latitude,
			longitude,
		);
		if (postgis && this.isCompleteAddress(postgis)) {
			this.logger.log(
				formatServerGeocodeResolvedLog(
					`geo_zips ${postgis.match}`,
					latitude,
					longitude,
					postgis,
				),
			);
			return {
				city: postgis.city,
				state: postgis.state,
				stateCode: postgis.stateCode,
				zip: postgis.zip,
				countryCode: postgis.countryCode,
				source: 'geo_zips',
				match: postgis.match,
			};
		}

		const cached = await this.geoReverseCache.findByCoordinates(
			latitude,
			longitude,
		);
		if (cached && this.isCompleteAddress(cached)) {
			this.logger.log(
				formatServerGeocodeResolvedLog(
					'geo_reverse_cache hit',
					latitude,
					longitude,
					cached,
				),
			);
			return cached;
		}

		const here = await this.hereReverseGeocode.reverseGeocode(
			latitude,
			longitude,
		);
		if (here?.address) {
			const mapped = this.fromHere(here.address);
			if (mapped) {
				await this.geoReverseCache.upsertFromReverseGeocode(
					latitude,
					longitude,
					mapped,
					'here',
				);
				this.logger.log(
					formatServerGeocodeResolvedLog(
						'HERE OK (cached to geo_reverse_cache)',
						latitude,
						longitude,
						mapped,
					),
				);
				return mapped;
			}
		}

		const nominatim = await this.nominatimReverseGeocode.reverseGeocode(
			latitude,
			longitude,
		);
		if (nominatim) {
			this.logger.log(
				formatServerGeocodeResolvedLog(
					'Nominatim fallback',
					latitude,
					longitude,
					{
						city: nominatim.city,
						state: nominatim.state,
						stateCode: '',
						zip: nominatim.zip,
					},
				),
			);
			return {
				city: nominatim.city,
				state: nominatim.state,
				stateCode: '',
				zip: nominatim.zip,
				countryCode: nominatim.country,
				source: 'nominatim',
			};
		}

		if (postgis) {
			return {
				city: postgis.city,
				state: postgis.state,
				stateCode: postgis.stateCode,
				zip: postgis.zip,
				countryCode: postgis.countryCode,
				source: 'geo_zips',
				match: postgis.match,
			};
		}

		return cached;
	}

	private isCompleteAddress(result: {
		city: string;
		state: string;
		zip: string;
	}): boolean {
		return Boolean(
			result.city?.trim() && result.state?.trim() && result.zip?.trim(),
		);
	}

	private fromHere(address: {
		city?: string;
		state?: string;
		stateCode?: string;
		postalCode?: string;
		countryCode?: string;
	}): DriverReverseGeocodeResult | null {
		const city = address.city?.trim() ?? '';
		const state = address.state?.trim() ?? '';
		const stateCode = address.stateCode?.trim() ?? '';
		const zip = address.postalCode?.trim() ?? '';
		const countryCode = this.normalizeCountryCode(address.countryCode);

		if (!city && !state && !zip) {
			return null;
		}

		return {
			city,
			state,
			stateCode,
			zip,
			countryCode,
			source: 'here',
		};
	}

	private normalizeCountryCode(raw: string | undefined): string {
		const code = raw?.trim().toUpperCase() ?? '';
		if (code === 'USA' || code === 'UNITED STATES') return 'US';
		if (code === 'MEX' || code === 'MEXICO') return 'MX';
		if (code === 'CAN' || code === 'CANADA') return 'CA';
		return code.length === 2 ? code : '';
	}
}
