import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeocodingController } from './geocoding.controller';
import { HerePlaywrightReverseGeocodeService } from './here-playwright-reverse-geocode.service';
import { NominatimReverseGeocodeService } from './nominatim-reverse-geocode.service';

@Module({
	imports: [ConfigModule],
	controllers: [GeocodingController],
	providers: [NominatimReverseGeocodeService, HerePlaywrightReverseGeocodeService],
	exports: [
		NominatimReverseGeocodeService,
		HerePlaywrightReverseGeocodeService,
	],
})
export class GeocodingModule {}
