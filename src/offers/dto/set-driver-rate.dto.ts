import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

export class SetDriverRateDto {
	@ApiProperty({
		description: 'Rate value offered to the driver (USD)',
		example: 150,
	})
	@IsNumber()
	@Min(0)
	rate: number;

	@ApiProperty({
		description: 'Rate time window in minutes (used to calculate action_time)',
		example: 30,
	})
	@IsNumber()
	@Min(0)
	rateTimeMinutes: number;

	@ApiProperty({
		description: 'Driver ETA string as selected in the mobile app (local time display)',
		example: '9:00 PM',
	})
	@IsString()
	driverEta: string;
}

