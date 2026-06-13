import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { S3Module } from '../s3/s3.module';
import { ImageConversionService } from './image-conversion.service';
import { ImagePreviewService } from './image-preview.service';
import { ThumbnailService } from './thumbnail.service';
import { HeicAttachmentService } from './heic-attachment.service';

@Module({
	imports: [S3Module],
	controllers: [StorageController],
	providers: [
		ImageConversionService,
		ImagePreviewService,
		ThumbnailService,
		HeicAttachmentService,
	],
	exports: [
		ImageConversionService,
		ImagePreviewService,
		ThumbnailService,
		HeicAttachmentService,
	],
})
export class StorageModule {}
