import {
	BadRequestException,
	Body,
	Controller,
	Post,
	UseGuards,
	Get,
	Query,
	Res,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { PresignBatchDto } from './dto/presign-batch.dto';
import { ImageConversionService } from './image-conversion.service';
import { ImagePreviewService } from './image-preview.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Storage')
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StorageController {
	constructor(
		private readonly s3: S3Service,
		private readonly imageConversionService: ImageConversionService,
		private readonly imagePreviewService: ImagePreviewService,
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

	@Post('presign-batch')
	@ApiOperation({
		summary: 'Generate presigned URLs for multiple file uploads',
		description:
			'Creates presigned URLs for a batch of files. Legacy clients can keep using POST /presign for single files.',
	})
	@ApiResponse({
		status: 200,
		description: 'Presigned URLs generated successfully',
		schema: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					uploadUrl: { type: 'string' },
					fileUrl: { type: 'string' },
					key: { type: 'string' },
				},
			},
		},
	})
	@ApiResponse({ status: 400, description: 'Invalid file type or filename' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	async presignBatch(@Body() dto: PresignBatchDto) {
		return Promise.all(
			dto.files.map((file) =>
				this.s3.createPresignedPut(file.filename, file.contentType),
			),
		);
	}

	@Post('convert-heic')
	@UseInterceptors(FileInterceptor('file'))
	@ApiOperation({
		summary: 'Convert uploaded HEIC/HEIF image to JPEG',
		description:
			'Converts an uploaded HEIC/HEIF file to JPEG before the client uploads it to object storage',
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
	async convertUploadedHeicToJpeg(
		@UploadedFile() file: Express.Multer.File | undefined,
		@Res() res: Response,
	) {
		if (!file?.buffer?.length) {
			throw new BadRequestException('Image file is required');
		}

		const jpegBuffer =
			await this.imageConversionService.convertHeicBufferToJpeg(file.buffer);

		res.setHeader('Content-Type', 'image/jpeg');
		res.setHeader('Content-Length', jpegBuffer.length);
		res.setHeader('Cache-Control', 'no-store');
		return res.send(jpegBuffer);
	}

	@Get('image-preview')
	@ApiOperation({
		summary: 'Create a compressed JPEG preview for chat thumbnails',
		description:
			'Downloads an image from object storage, optionally converts HEIC/HEIF, resizes and returns a JPEG preview',
	})
	@ApiQuery({
		name: 'url',
		description: 'URL of the source image in object storage',
		required: true,
		type: String,
	})
	@ApiQuery({
		name: 'w',
		description: 'Maximum preview width in pixels (default 640, max 1600)',
		required: false,
		type: Number,
	})
	@ApiQuery({
		name: 'q',
		description: 'JPEG quality 40-90 (default 72)',
		required: false,
		type: Number,
	})
	@ApiResponse({
		status: 200,
		description: 'Preview generated successfully',
		content: {
			'image/jpeg': {
				schema: {
					type: 'string',
					format: 'binary',
				},
			},
		},
	})
	async createImagePreview(
		@Query('url') imageUrl: string,
		@Query('w') widthParam: string | undefined,
		@Query('q') qualityParam: string | undefined,
		@Res() res: Response,
	) {
		if (!imageUrl) {
			return res.status(400).json({ error: 'Image URL is required' });
		}

		const parsedWidth = Number.parseInt(widthParam ?? '640', 10);
		const maxWidth = Number.isFinite(parsedWidth)
			? Math.min(Math.max(parsedWidth, 120), 1600)
			: 640;

		const parsedQuality = Number.parseInt(qualityParam ?? '72', 10);
		const quality = Number.isFinite(parsedQuality)
			? Math.min(Math.max(parsedQuality, 40), 90)
			: 72;

		try {
			const jpegBuffer = await this.imagePreviewService.createPreview(
				imageUrl,
				maxWidth,
				quality,
			);

			res.setHeader('Content-Type', 'image/jpeg');
			res.setHeader('Content-Length', jpegBuffer.length);
			res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

			return res.send(jpegBuffer);
		} catch (error) {
			console.error('[StorageController] Failed to create image preview:', error);
			if (error instanceof BadRequestException) {
				return res.status(400).json({ error: error.message });
			}
			if (error instanceof Error) {
				return res.status(500).json({ error: error.message });
			}
			return res.status(500).json({ error: 'Failed to create image preview' });
		}
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
