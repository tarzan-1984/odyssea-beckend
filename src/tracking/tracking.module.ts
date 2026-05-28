import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module';
import { TrackingTransferController } from './tracking-transfer.controller';
import { TrackingTransferService } from './tracking-transfer.service';

@Module({
	imports: [ChatsModule],
	controllers: [TrackingTransferController],
	providers: [TrackingTransferService],
})
export class TrackingModule {}

