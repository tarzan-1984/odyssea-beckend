import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { S3Module } from '../s3/s3.module';

@Module({
	imports: [S3Module],
	controllers: [StorageController],
})
export class StorageModule {}
