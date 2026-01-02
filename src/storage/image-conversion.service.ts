import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import * as sharp from 'sharp';
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

			// Convert HEIC/HEIF to JPEG using sharp
			// Note: sharp supports HEIC/HEIF if libvips is compiled with libheif support
			// If not supported, this will throw an error
			const jpegBuffer = await sharp(imageBuffer, {
				// Try to handle HEIC format
				failOn: 'none', // Don't fail on unsupported formats, try to process anyway
			})
				.jpeg({ quality: 92 })
				.toBuffer();

			return jpegBuffer;
		} catch (error) {
			console.error('[ImageConversionService] Failed to convert HEIC to JPEG:', error);
			
			// Check if error is due to unsupported format
			if (error instanceof Error && error.message.includes('unsupported') || error.message.includes('format')) {
				throw new BadRequestException(
					'HEIC format is not supported. Please ensure libheif is installed and sharp is compiled with HEIC support.',
				);
			}
			
			if (error instanceof Error) {
				throw new InternalServerErrorException(
					`Failed to convert HEIC image: ${error.message}`,
				);
			}
			throw new InternalServerErrorException('Failed to convert HEIC image');
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

	/**
	 * Check if sharp supports HEIC/HEIF format
	 * @returns boolean indicating if HEIC is supported
	 */
	async checkHeicSupport(): Promise<boolean> {
		try {
			// Try to create a sharp instance with HEIC format
			// This will fail if libheif is not available
			const testBuffer = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]); // HEIC file signature
			await sharp(testBuffer).metadata();
			return true;
		} catch (error) {
			return false;
		}
	}
}

