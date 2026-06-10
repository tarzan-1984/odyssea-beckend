import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
} from '@nestjs/common';
import sharp from 'sharp';
import { S3Service } from '../s3/s3.service';
import { ImageConversionService } from './image-conversion.service';

const PREVIEW_IMAGE_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'webp',
	'bmp',
	'tiff',
	'heic',
	'heif',
	'gif',
]);

@Injectable()
export class ImagePreviewService {
	constructor(
		private readonly s3Service: S3Service,
		private readonly imageConversionService: ImageConversionService,
	) {}

	async createPreview(
		imageUrl: string,
		maxWidth: number,
		quality: number,
	): Promise<Buffer> {
		this.s3Service.assertAllowedObjectUrl(imageUrl);

		const extension = this.getExtensionFromUrl(imageUrl);
		if (!extension || !PREVIEW_IMAGE_EXTENSIONS.has(extension)) {
			throw new BadRequestException('Preview is not supported for this file type');
		}

		try {
			let imageBuffer: Buffer;
			if (extension === 'heic' || extension === 'heif') {
				imageBuffer =
					await this.imageConversionService.convertHeicToJpeg(imageUrl);
			} else {
				imageBuffer =
					await this.imageConversionService.downloadImageBuffer(imageUrl);
			}

			return await sharp(imageBuffer)
				.rotate()
				.resize({
					width: maxWidth,
					withoutEnlargement: true,
				})
				.jpeg({
					quality,
					mozjpeg: true,
				})
				.toBuffer();
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error;
			}

			console.error('[ImagePreviewService] Failed to create preview:', error);
			if (error instanceof Error) {
				throw new InternalServerErrorException(
					`Failed to create image preview: ${error.message}`,
				);
			}
			throw new InternalServerErrorException('Failed to create image preview');
		}
	}

	private getExtensionFromUrl(url: string): string | null {
		try {
			const pathname = new URL(url).pathname;
			const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
			return ext && ext.length <= 8 ? ext : null;
		} catch {
			return null;
		}
	}
}
