import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeocodingController } from './geocoding.controller';
import { GeoPostgisReverseGeocodeService } from './geo-postgis-reverse-geocode.service';
import { HerePlaywrightReverseGeocodeService } from './here-playwright-reverse-geocode.service';
import { NominatimReverseGeocodeService } from './nominatim-reverse-geocode.service';

@Module({
	imports: [ConfigModule],
	controllers: [GeocodingController],
	providers: [
		NominatimReverseGeocodeService,
		HerePlaywrightReverseGeocodeService,
		GeoPostgisReverseGeocodeService,
	],
	exports: [
		NominatimReverseGeocodeService,
		HerePlaywrightReverseGeocodeService,
		GeoPostgisReverseGeocodeService,
	],
})
export class GeocodingModule {}
