import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignBatchItemDto {
	@ApiProperty({
		description: 'Original filename of the file to upload',
		example: 'photo.jpg',
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
		/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_+.]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_+.]*$/,
		{
			message: 'Invalid MIME type format',
		},
	)
	contentType?: string;
}

export class PresignBatchDto {
	@ApiProperty({
		description: 'Files to presign for direct upload (max 20)',
		type: [PresignBatchItemDto],
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	@ValidateNested({ each: true })
	@Type(() => PresignBatchItemDto)
	files: PresignBatchItemDto[];
}
