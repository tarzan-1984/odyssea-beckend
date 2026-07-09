import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SetDriverRateDto {
	@ApiProperty({
		description: 'Rate value offered to the driver (USD)',
		example: 150,
	})
	@IsNumber()
	@Min(0)
	rate: number;

	@ApiPropertyOptional({
		description:
			'Rate time window in minutes (used to calculate action_time in Unix seconds). Required for the first bid only.',
		example: 30,
	})
	@IsOptional()
	@IsNumber()
	@Min(0)
	rateTimeMinutes?: number;

	@ApiPropertyOptional({
		description:
			'Driver ETA string as selected in the mobile app (local time display). Required for the first bid only.',
		example: '9:00 PM',
	})
	@IsOptional()
	@IsString()
	driverEta?: string;
}
