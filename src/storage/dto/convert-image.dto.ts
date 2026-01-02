import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class ConvertImageDto {
	@ApiProperty({
		description: 'URL of the HEIC/HEIF image to convert to JPEG',
		example: 'https://s3.eu-central-1.wasabisys.com/bucket/files/image.heic',
	})
	@IsString()
	@IsUrl()
	imageUrl: string;
}

