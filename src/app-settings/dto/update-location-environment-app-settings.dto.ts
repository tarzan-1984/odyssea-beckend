import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateLocationEnvironmentAppSettingsDto {
	@ApiProperty({
		description: 'live = all drivers; test = only locationTestDriverExternalId may sync location',
		enum: ['live', 'test'],
		example: 'live',
	})
	@IsString()
	@IsIn(['live', 'test'])
	locationEnvironmentMode!: 'live' | 'test';

	@ApiProperty({
		description:
			'When mode is test, only this driver external id may update location (digits or alphanumeric as stored in DB)',
		example: '3343',
	})
	@IsString()
	@MinLength(1)
	@MaxLength(64)
	@Matches(/^[\dA-Za-z_-]+$/, {
		message: 'locationTestDriverExternalId must be a non-empty id string',
	})
	locationTestDriverExternalId!: string;
}
