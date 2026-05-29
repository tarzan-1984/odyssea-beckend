import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
	@ApiProperty({
		description:
			'When false, server will not send push notifications to this user.',
	})
	@IsBoolean()
	notificationsEnabled!: boolean;
}
