import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as convert from 'heic-convert';
import * as https from 'https';
import * as http from 'http';

@Injectable()
export class ImageConversionService {
	/**
	 * Convert HEIC/HEIF image to JPEG
	 * @param imageUrl - URL of the HEIC image to convert
	 * @returns Buffer containing JPEG image data
	 */
	async convertHeicToJpeg(imageUrl: string): Promise<Buffer> {
		try {
			// Download the image from URL
			const imageBuffer = await this.downloadImage(imageUrl);

			console.log(
				'[ImageConversionService] Image downloaded, size:',
				imageBuffer.length,
			);

			// Convert HEIC/HEIF to JPEG using heic-convert
			// heic-convert is specifically designed for HEIC conversion
			const jpegBuffer = await convert({
				buffer: imageBuffer,
				format: 'JPEG',
				quality: 0.92,
			});

			console.log(
				'[ImageConversionService] Conversion completed, JPEG size:',
				jpegBuffer.length,
			);

			// heic-convert returns ArrayBuffer, convert to Buffer
			if (jpegBuffer instanceof ArrayBuffer) {
				return Buffer.from(jpegBuffer);
			} else if (jpegBuffer instanceof Uint8Array) {
				return Buffer.from(jpegBuffer);
			} else {
				return Buffer.from(jpegBuffer);
			}
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
	private async downloadImage(url: string): Promise<Buffer> {
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
