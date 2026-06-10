import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as convert from 'heic-convert';
import * as https from 'https';
import * as http from 'http';

@Injectable()
export class ImageConversionService {
	async convertHeicBufferToJpeg(imageBuffer: Buffer): Promise<Buffer> {
		try {
			const jpegBuffer = await convert({
				buffer: imageBuffer,
				format: 'JPEG',
				quality: 0.92,
			});

			if (jpegBuffer instanceof ArrayBuffer) {
				return Buffer.from(jpegBuffer);
			} else if (jpegBuffer instanceof Uint8Array) {
				return Buffer.from(jpegBuffer);
			} else {
				return Buffer.from(jpegBuffer);
			}
		} catch (error) {
			console.error(
				'[ImageConversionService] Failed to convert HEIC buffer to JPEG:',
				error,
			);

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

	/**
	 * Convert HEIC/HEIF image to JPEG
	 * @param imageUrl - URL of the HEIC image to convert
	 * @returns Buffer containing JPEG image data
	 */
	async convertHeicToJpeg(imageUrl: string): Promise<Buffer> {
		try {
			// Download the image from URL
			const imageBuffer = await this.downloadImageBuffer(imageUrl);

			console.log(
				'[ImageConversionService] Image downloaded, size:',
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

	/**
	 * Download image from URL
	 * @param url - URL of the image to download
	 * @returns Buffer containing image data
	 */
	async downloadImageBuffer(url: string): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const protocol = url.startsWith('https') ? https : http;

			protocol
				.get(url, (response) => {
					if (response.statusCode !== 200) {
						reject(
							new Error(
								`Failed to download image: ${response.statusCode} ${response.statusMessage}`,
							),
						);
						return;
					}

					const chunks: Buffer[] = [];
					response.on('data', (chunk) => chunks.push(chunk));
					response.on('end', () => resolve(Buffer.concat(chunks)));
					response.on('error', reject);
				})
				.on('error', reject);
		});
	}
}
