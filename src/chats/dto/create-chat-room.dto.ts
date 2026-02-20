import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChatRoomDto {
	@ApiProperty({
		description:
			'Name of the chat room. For OFFER chats: required, format "firstName lastName (id: offerId)\\npickUp - delivery" (two lines). Optional for other types.',
		example: 'John Doe (id: cmlp14l0d0001mo3534ns2kzo)\nsdfsdf - sdfsdf',
		required: false,
	})
	@IsOptional()
	@IsString()
	name?: string;

	@ApiProperty({
		description: 'Type of chat room',
		enum: ['DIRECT', 'GROUP', 'LOAD', 'OFFER'],
		example: 'DIRECT',
	})
	@IsString()
	@IsEnum(['DIRECT', 'GROUP', 'LOAD', 'OFFER'])
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
		description: 'Offer ID for OFFER chats (links chat to an offer)',
		example: 'cmlp1410d0001mo3534hs2kzo',
		required: false,
	})
	@IsOptional()
	@IsString()
	offerId?: string;

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
