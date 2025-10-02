import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChatRoomDto {
	@ApiProperty({
		description: 'Name of the chat room (optional for direct chats)',
		example: 'Load #12345 Discussion',
		required: false,
	})
	@IsOptional()
	@IsString()
	name?: string;

	@ApiProperty({
		description: 'Type of chat room',
		enum: ['DIRECT', 'GROUP', 'LOAD'],
		example: 'DIRECT',
	})
	@IsString()
	@IsEnum(['DIRECT', 'GROUP', 'LOAD'])
	type: string;

	@ApiProperty({
		description: 'Load ID for load-related chats',
		example: 'load_123',
		required: false,
	})
	@IsOptional()
	@IsString()
	loadId?: string;

	@ApiProperty({
		description: 'Avatar URL for the chat room',
		example: 'https://example.com/avatar.jpg',
		required: false,
	})
	@IsOptional()
	@IsString()
	avatar?: string;

	@ApiProperty({
		description: 'Array of user IDs to add to the chat room',
		example: ['user1', 'user2'],
		type: [String],
	})
	@IsArray()
	@IsString({ each: true })
	participantIds: string[];
}
