import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class MessageAttachmentDto {
	@ApiProperty({ example: 'https://storage.example.com/file.png' })
	@IsString()
	fileUrl: string;

	@ApiProperty({ example: 'photo.png' })
	@IsString()
	fileName: string;

	@ApiProperty({ example: 102400, required: false })
	@IsOptional()
	@IsNumber()
	fileSize?: number;
}
