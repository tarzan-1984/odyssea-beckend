import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class HereReverseGeocodeQueryDto {
	@ApiProperty({ example: 43.65304, description: 'Latitude (WGS84)' })
	@Type(() => Number)
	@IsNumber()
	@Min(-90)
	@Max(90)
	lat!: number;

	@ApiProperty({ example: -79.38064, description: 'Longitude (WGS84)' })
	@Type(() => Number)
	@IsNumber()
	@Min(-180)
	@Max(180)
	lng!: number;
}
