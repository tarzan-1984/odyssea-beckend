import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateBulkDirectChatsDto } from './create-bulk-direct-chats.dto';

export class CreateBulkDirectChatsWithMessageDto extends CreateBulkDirectChatsDto {
	@ApiPropertyOptional({
		description:
			'Optional message to send in each chat after creation (or into an existing direct chat)',
		example: 'Please check if the app is running.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(10000)
	message?: string;
}
