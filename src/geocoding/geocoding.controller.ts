import {
	Controller,
	Get,
	Query,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
import { HereReverseGeocodeQueryDto } from './dto/here-reverse-geocode-query.dto';
import { HerePlaywrightReverseGeocodeService } from './here-playwright-reverse-geocode.service';

@ApiTags('Geocoding')
@Controller('geocoding')
export class GeocodingController {
	constructor(
		private readonly herePlaywrightReverseGeocode: HerePlaywrightReverseGeocodeService,
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
}
