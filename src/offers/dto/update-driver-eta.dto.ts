import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateDriverEtaDto {
	@ApiProperty({
		description:
			'Driver ETA string as selected in the mobile app (local time display, e.g. "9:00 PM")',
		example: '9:00 PM',
	})
	@IsString()
	@MinLength(1)
	driverEta: string;
}
