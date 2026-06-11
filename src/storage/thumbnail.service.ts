import { Injectable } from '@nestjs/common';
import { S3Service } from '../s3/s3.service';
import { ImagePreviewService } from './image-preview.service';
import {
	DEFAULT_THUMBNAIL_MAX_WIDTH,
	DEFAULT_THUMBNAIL_QUALITY,
	buildThumbnailUrlFromFileUrl,
	getThumbnailObjectKey,
	isThumbnailCandidateFileName,
} from './chat-thumbnail.util';

export type EnsureThumbnailResult = {
	thumbnailUrl: string;
	created: boolean;
};

@Injectable()
export class ThumbnailService {
	constructor(
		private readonly s3Service: S3Service,
		private readonly imagePreviewService: ImagePreviewService,
	) {}

	async ensureThumbnail(
		imageUrl: string,
		fileName: string,
		maxWidth: number = DEFAULT_THUMBNAIL_MAX_WIDTH,
		quality: number = DEFAULT_THUMBNAIL_QUALITY,
	): Promise<EnsureThumbnailResult | null> {
		if (!imageUrl?.trim() || !isThumbnailCandidateFileName(fileName)) {
			return null;
		}

		const originalKey = this.s3Service.assertAllowedObjectUrl(imageUrl);
		const thumbKey = getThumbnailObjectKey(originalKey, maxWidth, quality);
		const existingUrl = buildThumbnailUrlFromFileUrl(imageUrl, maxWidth, quality);

		if (await this.s3Service.objectExists(thumbKey)) {
			return {
				thumbnailUrl: existingUrl ?? this.s3Service.getPublicUrlForKey(thumbKey),
				created: false,
			};
		}

		const jpegBuffer = await this.imagePreviewService.createPreview(
			imageUrl,
			maxWidth,
			quality,
		);
		const thumbnailUrl = await this.s3Service.putImageObject(thumbKey, jpegBuffer);

		return { thumbnailUrl, created: true };
	}

	async ensureThumbnailsForMessage(
		fileUrl: string | null | undefined,
		fileName: string | null | undefined,
		attachments?: { fileUrl: string; fileName: string }[] | null,
	): Promise<void> {
		const items: { fileUrl: string; fileName: string }[] = [];

		if (attachments?.length) {
			for (const a of attachments) {
				if (a.fileUrl?.trim() && a.fileName?.trim()) {
					items.push({ fileUrl: a.fileUrl.trim(), fileName: a.fileName.trim() });
				}
			}
		} else if (fileUrl?.trim() && fileName?.trim()) {
			const urls = fileUrl.split('|');
			const names = fileName.split('|');
			for (let i = 0; i < urls.length; i++) {
				const url = urls[i]?.trim();
				const name = names[i]?.trim();
				if (url && name) {
					items.push({ fileUrl: url, fileName: name });
				}
			}
		}

		await Promise.all(
			items.map(async (item) => {
				try {
					await this.ensureThumbnail(item.fileUrl, item.fileName);
				} catch (error) {
					console.error(
						'[ThumbnailService] Failed to ensure thumbnail:',
						item.fileUrl,
						error,
					);
				}
			}),
		);
	}
}
