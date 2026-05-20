import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessageTemplatesController } from './message-templates.controller';
import { MessageTemplatesService } from './message-templates.service';

@Module({
	imports: [PrismaModule],
	controllers: [MessageTemplatesController],
	providers: [MessageTemplatesService],
	exports: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
