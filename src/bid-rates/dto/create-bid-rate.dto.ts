import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateBidRateDto {
	@ApiProperty({ example: 'Chicago, IL' })
	@IsString()
	@IsNotEmpty()
	origin: string;

	@ApiProperty({ example: 'Dallas, TX' })
	@IsString()
	@IsNotEmpty()
	destination: string;

	@ApiProperty({ example: 'ABC Logistics' })
	@IsString()
	@IsNotEmpty()
	broker: string;

	@ApiProperty({ example: 1250.5 })
	@IsNumber()
	@Min(0)
	rate: number;
}
