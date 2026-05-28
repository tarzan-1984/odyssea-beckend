import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NominatimReverseGeocodeService } from './nominatim-reverse-geocode.service';

@Module({
	imports: [ConfigModule],
	providers: [NominatimReverseGeocodeService],
	exports: [NominatimReverseGeocodeService],
})
export class GeocodingModule {}
