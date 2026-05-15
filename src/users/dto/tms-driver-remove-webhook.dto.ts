import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class TmsDriverRemoveWebhookDto {
	@ApiProperty({
		description: 'TMS driver id (stored as users.externalId)',
		example: '12345',
	})
	@Transform(({ value }) =>
		value == null || value === '' ? '' : String(value).trim(),
	)
	@IsString()
	@IsNotEmpty()
	driverId!: string;

	@ApiProperty({
		enum: ['remove-soft', 'restore'],
		description:
			'remove-soft → deactivateAccount true; restore → deactivateAccount false',
	})
	@IsString()
	@IsIn(['remove-soft', 'restore'])
	event!: 'remove-soft' | 'restore';
}
