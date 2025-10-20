import { Body, Controller, HttpCode, HttpStatus, Post, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveBackgroundService } from './services/archive-background.service';
import { ChatGateway } from './chat.gateway';

@ApiTags('Load Chat')
@Controller('delete_load_chat')
export class DeleteLoadChatController {
	constructor(
		private readonly prisma: PrismaService,
		private readonly archiveBackgroundService: ArchiveBackgroundService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
	) {}

	@Post()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Delete LOAD chat immediately via WebSocket, archive by days in background, then remove from DB' })
	@ApiResponse({ status: 200, description: 'Background deletion/archiving started' })
	async deleteLoadChat(@Body() body: { load_id: string }) {
		const { load_id } = body;
		const chat = await this.prisma.chatRoom.findFirst({ 
			where: { type: 'LOAD', loadId: load_id },
			include: {
				participants: {
					select: { userId: true }
				}
			}
		});
		if (!chat) {
			return { started: false, message: 'LOAD chat not found' };
		}

		// Emit WebSocket event to all participants to remove chat from UI immediately
		for (const participant of chat.participants) {
			this.chatGateway.server
				.to(`user_${participant.userId}`)
				.emit('chatRoomDeleted', { chatRoomId: chat.id });
		}

		// Start background archive-by-day and delete
		const result = await this.archiveBackgroundService.startFullArchiveAndDelete(chat.id);
		return { started: true, chatRoomId: chat.id, jobId: result.jobId };
	}
}


