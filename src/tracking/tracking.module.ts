import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module';
import { TrackingTransferController } from './tracking-transfer.controller';
import { TrackingTransferService } from './tracking-transfer.service';
import { TrackingTeamsModule } from './tracking-teams.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
	imports: [ChatsModule, TrackingTeamsModule, NotificationsModule],
	controllers: [TrackingTransferController],
	providers: [TrackingTransferService],
})
export class TrackingModule {}
