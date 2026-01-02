import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MarkAllReadDto {
	@ApiProperty({
		description: 'Array of chat room IDs where to mark all messages as read',
		example: ['chat_room_1', 'chat_room_2'],
		type: [String],
	})
	@IsArray()
	@IsString({ each: true })
	chatRoomIds: string[];
}

