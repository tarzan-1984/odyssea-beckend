import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignDto {
	@ApiProperty({
		description: 'Original filename of the file to upload',
		example: 'document.pdf',
		required: false,
		maxLength: 255,
	})
	@IsOptional()
	@IsString()
	@MaxLength(255)
	@Matches(/^[^<>:"/\\|?*]+$/, {
		message: 'Filename contains invalid characters',
	})
	filename?: string;

	@ApiProperty({
		description: 'MIME type of the file',
		example: 'image/jpeg',
		required: false,
		maxLength: 128,
	})
	@IsOptional()
	@IsString()
	@MaxLength(128)
	@Matches(
		/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]*$/,
		{
			message: 'Invalid MIME type format',
		},
	)
	contentType?: string;
}
