import { Injectable } from '@nestjs/common';
import { S3Service } from '../s3/s3.service';
import { ImageConversionService } from './image-conversion.service';
import { ThumbnailService } from './thumbnail.service';
import {
	isHeicFileName,
	isHeicObjectKey,
	toJpegFilename,
} from './heic-attachment.util';

export type NormalizedChatAttachment = {
	fileUrl: string;
	fileName: string;
	fileSize: number | null;
};

@Injectable()
export class HeicAttachmentService {
	constructor(
		private readonly s3Service: S3Service,
		private readonly imageConversionService: ImageConversionService,
		private readonly thumbnailService: ThumbnailService,
	) {}

	isHeicAttachment(fileName: string, fileUrl?: string): boolean {
		if (fileUrl?.trim()) {
			try {
				const key = this.s3Service.parseObjectKeyFromUrl(fileUrl.trim());
				const ext = key.split('.').pop()?.toLowerCase() ?? '';
				if (ext === 'jpg' || ext === 'jpeg') {
					return false;
				}
				if (isHeicObjectKey(key)) {
					return true;
				}
			} catch {
				// Fall back to filename-based detection below
			}
		}

		return isHeicFileName(fileName);
	}

	/**
	 * Convert HEIC/HEIF chat attachment to JPEG in object storage before persisting the message.
	 * Non-HEIC attachments are returned unchanged.
	 */
	async normalizeAttachment(params: {
		fileUrl: string;
		fileName: string;
		fileSize?: number | null;
	}): Promise<NormalizedChatAttachment> {
		const fileUrl = params.fileUrl.trim();
		const fileName = params.fileName.trim();

		if (!this.isHeicAttachment(fileName, fileUrl)) {
			return {
				fileUrl,
				fileName,
				fileSize: params.fileSize ?? null,
			};
		}

		const sourceKey = this.s3Service.assertAllowedObjectUrl(fileUrl);
		const jpegBuffer =
			await this.imageConversionService.convertHeicToJpeg(fileUrl);
		const jpegFileName = toJpegFilename(fileName);
		const jpegKey = this.s3Service.createChatObjectKey(jpegFileName);
		const jpegFileUrl = await this.s3Service.putImageObject(
			jpegKey,
			jpegBuffer,
		);

		try {
			await this.s3Service.deleteObject(sourceKey);
		} catch (error) {
			console.warn(
				'[HeicAttachmentService] Failed to delete source HEIC object:',
				sourceKey,
				error,
			);
		}

		try {
			await this.thumbnailService.ensureThumbnail(jpegFileUrl, jpegFileName);
		} catch (error) {
			console.error(
				'[HeicAttachmentService] Thumbnail generation failed after HEIC conversion:',
				jpegFileUrl,
				error,
			);
		}

		return {
			fileUrl: jpegFileUrl,
			fileName: jpegFileName,
			fileSize: jpegBuffer.length,
		};
	}

	async normalizeMessageAttachments(params: {
		fileUrl: string | null;
		fileName: string | null;
		fileSize: number | null;
		attachmentList: { fileUrl: string; fileName: string; fileSize?: number }[] | null;
	}): Promise<{
		fileUrl: string | null;
		fileName: string | null;
		fileSize: number | null;
		attachmentList: { fileUrl: string; fileName: string; fileSize?: number }[] | null;
	}> {
		if (params.attachmentList?.length) {
			const normalizedList = await Promise.all(
				params.attachmentList.map((attachment) =>
					this.normalizeAttachment(attachment),
				),
			);

			return {
				fileUrl: normalizedList.map((item) => item.fileUrl).join('|'),
				fileName: normalizedList.map((item) => item.fileName).join('|'),
				fileSize: normalizedList[0]?.fileSize ?? params.fileSize,
				attachmentList: normalizedList.map((item, index) => ({
					fileUrl: item.fileUrl,
					fileName: item.fileName,
					fileSize:
						item.fileSize ??
						params.attachmentList![index].fileSize ??
						undefined,
				})),
			};
		}

		if (params.fileUrl?.trim() && params.fileName?.trim()) {
			const normalized = await this.normalizeAttachment({
				fileUrl: params.fileUrl,
				fileName: params.fileName,
				fileSize: params.fileSize,
			});

			return {
				fileUrl: normalized.fileUrl,
				fileName: normalized.fileName,
				fileSize: normalized.fileSize ?? params.fileSize,
				attachmentList: null,
			};
		}

		return {
			fileUrl: params.fileUrl,
			fileName: params.fileName,
			fileSize: params.fileSize,
			attachmentList: params.attachmentList,
		};
	}
}
