import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class TmsDriverRatingWebhookDto {
	@ApiProperty({
		description: 'TMS driver id (stored as users.externalId)',
		example: '3343',
	})
	@Transform(({ value }) =>
		value == null || value === '' ? '' : String(value).trim(),
	)
	@IsString()
	@IsNotEmpty()
	driver_id!: string;

	@ApiProperty({
		description: 'Average driver rating from TMS (written to users.driver_rating)',
		example: '3.47',
	})
	@Transform(({ value }) => {
		if (value == null || value === '') return '';
		return typeof value === 'number' ? String(value) : String(value).trim();
	})
	@IsString()
	@IsNotEmpty()
	average_rating!: string;
}
