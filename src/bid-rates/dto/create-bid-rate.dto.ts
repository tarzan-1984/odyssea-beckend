import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsNotEmpty,
	IsNumber,
	IsString,
	Min,
	ValidateNested,
} from 'class-validator';
import { RoutePointDto } from '../../offers/dto/create-offer.dto';

export class CreateBidRateDto {
	@ApiProperty({
		description:
			'Route: array of points (pick_up_location / delivery_location) in order, same format as offers.route',
		type: [RoutePointDto],
	})
	@IsArray()
	@ArrayMinSize(2)
	@ValidateNested({ each: true })
	@Type(() => RoutePointDto)
	route: RoutePointDto[];

	@ApiProperty({ example: 'ABC Logistics' })
	@IsString()
	@IsNotEmpty()
	broker: string;

	@ApiProperty({ example: 1250.5 })
	@IsNumber()
	@Min(0)
	rate: number;

	@ApiProperty({
		description: 'Route distance in miles (auto-calculated or manually overridden)',
		example: 425,
	})
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	distance: number;
}
