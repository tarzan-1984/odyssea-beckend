import {
	ArrayMaxSize,
	IsArray,
	IsOptional,
	IsString,
	ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SyncMessagesBatchRoomDto {
	@ApiProperty({
		description: 'Chat room ID',
		example: 'chat_room_123',
	})
	@IsString()
	chatRoomId: string;

	@ApiPropertyOptional({
		description:
			'Last message ID the client has locally. Omit or null when the client has no messages for this room.',
		example: 'message_abc',
		nullable: true,
	})
	@IsOptional()
	@IsString()
	lastMessageId?: string | null;
}

export class SyncMessagesBatchDto {
	@ApiProperty({
		description: 'Rooms to check for missing messages (max 50 per request)',
		type: [SyncMessagesBatchRoomDto],
	})
	@IsArray()
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => SyncMessagesBatchRoomDto)
	rooms: SyncMessagesBatchRoomDto[];
}
