import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
	@ApiProperty({
		description: 'ID of the chat room where to send the message',
		example: 'chat_room_123',
	})
	@IsString()
	chatRoomId: string;

	@ApiProperty({
		description: 'Content of the message',
		example: 'Hello! How is the delivery going?',
	})
	@IsString()
	content: string;

	@ApiProperty({
		description: 'URL of the uploaded file (optional)',
		example: 'https://drive.google.com/file/123',
		required: false,
	})
	@IsOptional()
	@IsString()
	fileUrl?: string;

	@ApiProperty({
		description: 'Name of the uploaded file (optional)',
		example: 'delivery_photo.jpg',
		required: false,
	})
	@IsOptional()
	@IsString()
	fileName?: string;

	@ApiProperty({
		description: 'Size of the uploaded file in bytes (optional)',
		example: 1024000,
		required: false,
	})
	@IsOptional()
	@IsNumber()
	fileSize?: number;

	@ApiProperty({
		description: 'Reply data for the message being replied to (optional)',
		example: {
			avatar: 'https://example.com/avatar.jpg',
			time: '2024-01-15T10:30:00Z',
			content: 'Original message content',
			senderName: 'John Doe'
		},
		required: false,
	})
	@IsOptional()
	@IsObject()
	replyData?: {
		avatar?: string;
		time: string;
		content: string;
		senderName: string;
	};
}
