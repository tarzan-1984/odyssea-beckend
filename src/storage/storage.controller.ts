import { Body, Controller, Post, UseGuards, Get, Query, Res } from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { S3Service } from '../s3/s3.service';
import { PresignDto } from './dto/presign.dto';
import { ImageConversionService } from './image-conversion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Storage')
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StorageController {
	constructor(
		private readonly s3: S3Service,
		private readonly imageConversionService: ImageConversionService,
	) {}

	@Post('presign')
	@ApiOperation({
		summary: 'Generate presigned URL for file upload',
		description:
			'Creates a presigned URL for direct file upload to S3/Wasabi storage',
	})
	@ApiResponse({
		status: 200,
		description: 'Presigned URL generated successfully',
		schema: {
			type: 'object',
			properties: {
				uploadUrl: {
					type: 'string',
					description: 'URL for uploading the file',
				},
				fileUrl: {
					type: 'string',
					description: 'Final URL of the uploaded file',
				},
				key: { type: 'string', description: 'S3 object key' },
			},
		},
	})
	@ApiResponse({ status: 400, description: 'Invalid file type or filename' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	async presign(@Body() dto: PresignDto) {
		// Returns { uploadUrl, fileUrl, key }
		return this.s3.createPresignedPut(dto.filename, dto.contentType);
	}

	@Get('convert-heic')
	@ApiOperation({
		summary: 'Convert HEIC/HEIF image to JPEG',
		description:
			'Converts a HEIC/HEIF image from the provided URL to JPEG format for browser compatibility',
	})
	@ApiQuery({
		name: 'url',
		description: 'URL of the HEIC/HEIF image to convert',
		required: true,
		type: String,
		example: 'https://s3.eu-central-1.wasabisys.com/bucket/files/image.heic',
	})
	@ApiResponse({
		status: 200,
		description: 'Image converted successfully',
		content: {
			'image/jpeg': {
				schema: {
					type: 'string',
					format: 'binary',
				},
			},
		},
	})
	@ApiResponse({ status: 400, description: 'Invalid image URL' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 500, description: 'Conversion failed' })
	async convertHeicToJpeg(
		@Query('url') imageUrl: string,
		@Res() res: Response,
	) {
		if (!imageUrl) {
			return res.status(400).json({ error: 'Image URL is required' });
		}

		try {
			const jpegBuffer = await this.imageConversionService.convertHeicToJpeg(
				imageUrl,
			);

			// Set response headers
			res.setHeader('Content-Type', 'image/jpeg');
			res.setHeader('Content-Length', jpegBuffer.length);
			res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

			// Send the JPEG image
			return res.send(jpegBuffer);
		} catch (error) {
			console.error('[StorageController] Failed to convert HEIC:', error);
			if (error instanceof Error) {
				return res.status(500).json({ error: error.message });
			}
			return res.status(500).json({ error: 'Failed to convert image' });
		}
	}
}
