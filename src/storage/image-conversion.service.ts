import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as convert from 'heic-convert';
import sharp = require('sharp');
import { S3Service } from '../s3/s3.service';

export const DEFAULT_HEIC_JPEG_QUALITY = 0.92;
/** JPEG quality for chat upload conversion (client fallback / batch endpoint). */
export const CHAT_UPLOAD_HEIC_JPEG_QUALITY = 0.5;

@Injectable()
export class ImageConversionService {
	constructor(private readonly s3Service: S3Service) {}

	async convertHeicBufferToJpeg(
		imageBuffer: Buffer,
		quality: number = DEFAULT_HEIC_JPEG_QUALITY,
	): Promise<Buffer> {
		const normalizedQuality = Math.min(Math.max(quality, 0.1), 1);
		try {
			const jpegBuffer = await convert({
				buffer: imageBuffer,
				format: 'JPEG',
				quality: normalizedQuality,
			});

			if (jpegBuffer instanceof ArrayBuffer) {
				return Buffer.from(jpegBuffer);
			}
			if (jpegBuffer instanceof Uint8Array) {
				return Buffer.from(jpegBuffer);
			}
			return Buffer.from(jpegBuffer);
		} catch (heicConvertError) {
			console.warn(
				'[ImageConversionService] heic-convert failed, trying sharp:',
				heicConvertError,
			);

			try {
				return await sharp(imageBuffer)
					.rotate()
					.jpeg({
						quality: Math.round(normalizedQuality * 100),
						mozjpeg: true,
					})
					.toBuffer();
			} catch (sharpError) {
				console.error(
					'[ImageConversionService] Failed to convert HEIC buffer to JPEG:',
					sharpError,
				);

				const message =
					sharpError instanceof Error
						? sharpError.message
						: heicConvertError instanceof Error
							? heicConvertError.message
							: 'Unknown conversion error';

				throw new InternalServerErrorException(
					`Failed to convert HEIC image: ${message}`,
				);
			}
		}
	}

	/**
	 * Convert HEIC/HEIF image to JPEG
	 * @param imageUrl - URL of the HEIC image in object storage
	 * @returns Buffer containing JPEG image data
	 */
	async convertHeicToJpeg(imageUrl: string): Promise<Buffer> {
		try {
			const imageBuffer = await this.s3Service.getObjectBufferByUrl(imageUrl);

			console.log(
				'[ImageConversionService] Image loaded from storage, size:',
				imageBuffer.length,
			);

			const jpegBuffer = await this.convertHeicBufferToJpeg(imageBuffer);

			console.log(
				'[ImageConversionService] Conversion completed, JPEG size:',
				jpegBuffer.length,
			);

			return jpegBuffer;
		} catch (error) {
			console.error(
				'[ImageConversionService] Failed to convert HEIC to JPEG:',
				error,
			);

			if (error instanceof InternalServerErrorException) {
				throw error;
			}

			if (error instanceof Error) {
				throw new InternalServerErrorException(
					`Failed to convert HEIC image: ${error.message}`,
				);
			}
			throw new InternalServerErrorException(
				'Failed to convert HEIC image',
			);
		}
	}
}
