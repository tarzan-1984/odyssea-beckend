import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateMessageDto {
	@ApiProperty({
		description: 'Updated message content',
		example: 'Updated delivery status',
	})
	@IsString()
	content: string;
}
