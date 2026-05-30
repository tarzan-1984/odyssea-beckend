import {
	Controller,
	Get,
	Query,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
import { GeoPostgisReverseGeocodeQueryDto } from './dto/geo-postgis-reverse-geocode-query.dto';
import { HereReverseGeocodeQueryDto } from './dto/here-reverse-geocode-query.dto';
import { GeoPostgisReverseGeocodeService } from './geo-postgis-reverse-geocode.service';
import { HerePlaywrightReverseGeocodeService } from './here-playwright-reverse-geocode.service';

@ApiTags('Geocoding')
@Controller('geocoding')
export class GeocodingController {
	constructor(
		private readonly herePlaywrightReverseGeocode: HerePlaywrightReverseGeocodeService,
		private readonly geoPostgisReverseGeocode: GeoPostgisReverseGeocodeService,
	) {}

	@Get('here/reverse')
	@SkipAuth()
	@ApiOperation({
		summary: 'Reverse geocode via HERE WeGo (Playwright intercept)',
		description:
			'Open endpoint. Opens maps.here.com for the coordinates in headless Chromium and returns the JSON from the internal revgeocode.search.hereapi.com/v1/revgeocode XHR.',
	})
	@ApiResponse({ status: 200, description: 'HERE address for coordinates' })
	@ApiResponse({ status: 404, description: 'No address found' })
	@ApiResponse({ status: 503, description: 'Playwright / Chromium unavailable' })
	async reverseGeocodeHere(@Query() query: HereReverseGeocodeQueryDto) {
		try {
			const result = await this.herePlaywrightReverseGeocode.reverseGeocode(
				query.lat,
				query.lng,
			);

			if (!result) {
				return {
					success: false,
					data: null,
					message: 'No HERE address found for these coordinates',
				};
			}

			return {
				success: true,
				data: result,
			};
		} catch (error) {
			if (error instanceof ServiceUnavailableException) {
				throw error;
			}
			throw new ServiceUnavailableException(
				'HERE reverse geocode failed',
			);
		}
	}

	@Get('geo-zips/reverse')
	@SkipAuth()
	@ApiOperation({
		summary: 'Reverse geocode via PostGIS geo_zips (test endpoint)',
		description:
			'Looks up city/state/zip from geo_zips using ST_Contains, with nearest-polygon fallback. Does not call Nominatim.',
	})
	@ApiResponse({ status: 200, description: 'Address fields for coordinates' })
	async reverseGeocodeGeoZips(@Query() query: GeoPostgisReverseGeocodeQueryDto) {
		const result = await this.geoPostgisReverseGeocode.reverseGeocode(
			query.latitude,
			query.longitude,
		);

		if (!result) {
			return {
				success: false,
				data: null,
				message: 'No geo_zips match for these coordinates',
			};
		}

		return {
			success: true,
			data: {
				city: result.city,
				state: result.state,
				stateCode: result.stateCode,
				zip: result.zip,
				countryCode: result.countryCode,
				match: result.match,
			},
		};
	}
}
