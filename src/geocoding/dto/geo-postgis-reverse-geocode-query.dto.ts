import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class GeoPostgisReverseGeocodeQueryDto {
	@ApiProperty({ example: 43.6532, description: 'Latitude (WGS84)' })
	@Type(() => Number)
	@IsNumber()
	@Min(-90)
	@Max(90)
	latitude!: number;

	@ApiProperty({ example: -79.3832, description: 'Longitude (WGS84)' })
	@Type(() => Number)
	@IsNumber()
	@Min(-180)
	@Max(180)
	longitude!: number;
}
