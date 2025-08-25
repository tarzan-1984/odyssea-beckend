import { Module } from '@nestjs/common';
import { ChatRoomsService } from './chat-rooms.service';
import { MessagesService } from './messages.service';
import { ChatRoomsController } from './chat-rooms.controller';
import { MessagesController } from './messages.controller';
import { ChatGateway } from './chat.gateway';
import { FileUploadService } from './file-upload.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChatRoomsController, MessagesController],
  providers: [
    ChatRoomsService,
    MessagesService,
    ChatGateway,
    FileUploadService,
  ],
  exports: [ChatRoomsService, MessagesService, FileUploadService],
})
export class ChatsModule {}
