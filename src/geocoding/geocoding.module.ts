import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DriverReverseGeocodeService } from './driver-reverse-geocode.service';
import { GeocodingController } from './geocoding.controller';
import { GeoPostgisReverseGeocodeService } from './geo-postgis-reverse-geocode.service';
import { GeoReverseCacheService } from './geo-reverse-cache.service';
import { HerePlaywrightReverseGeocodeService } from './here-playwright-reverse-geocode.service';
import { NominatimReverseGeocodeService } from './nominatim-reverse-geocode.service';

@Module({
	imports: [ConfigModule],
	controllers: [GeocodingController],
	providers: [
		NominatimReverseGeocodeService,
		HerePlaywrightReverseGeocodeService,
		GeoPostgisReverseGeocodeService,
		GeoReverseCacheService,
		DriverReverseGeocodeService,
	],
	exports: [
		NominatimReverseGeocodeService,
		HerePlaywrightReverseGeocodeService,
		GeoPostgisReverseGeocodeService,
		GeoReverseCacheService,
		DriverReverseGeocodeService,
	],
})
export class GeocodingModule {}
