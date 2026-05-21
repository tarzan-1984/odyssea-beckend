import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateDeliveredLoadChatAppSettingsDto {
	@ApiProperty({
		description:
			'Hours after deliveryAt on a LOAD chat before the cleanup cron sets isLoadArchived=true (chat is not deleted).',
		example: 5,
		minimum: 1,
	})
	@IsInt()
	@Min(1)
	@Max(720)
	deliveredLoadChatArchiveAfterHours!: number;
}
