import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { S3Module } from '../s3/s3.module';
import { ImageConversionService } from './image-conversion.service';

@Module({
	imports: [S3Module],
	controllers: [StorageController],
	providers: [ImageConversionService],
	exports: [ImageConversionService],
})
export class StorageModule {}
