import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	Inject,
	UseGuards,
	Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveBackgroundService } from './services/archive-background.service';
import { ChatGateway } from './chat.gateway';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';

@ApiTags('Load Chat')
@Controller('delete_load_chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
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
	async deleteLoadChat(@Request() req: AuthenticatedRequest, @Body() body: { load_id: string }) {
		const { load_id } = body;
		const chat = await this.prisma.chatRoom.findFirst({
			where: { type: 'LOAD', loadId: load_id },
			include: {
				participants: {
					select: { userId: true },
				},
			},
		});
		if (!chat) {
			return { started: false, message: 'LOAD chat not found' };
		}

		const notified = new Set<string>();
		const payload = { chatRoomId: chat.id, deletedBy: req.user.id };

		// Emit WebSocket event to all participants (drivers/staff who are members)
		for (const participant of chat.participants) {
			notified.add(participant.userId);
			this.chatGateway.server
				.to(`user_${participant.userId}`)
				.emit('chatRoomDeleted', payload);
		}

		// Admins/operators who delete archived LOAD chats are often not participants — notify them too
		if (!notified.has(req.user.id)) {
			this.chatGateway.server.to(`user_${req.user.id}`).emit('chatRoomDeleted', payload);
		}

		// Start background archive-by-day and delete
		const result = await this.archiveBackgroundService.startFullArchiveAndDelete(chat.id);
		return { started: true, chatRoomId: chat.id, jobId: result.jobId };
	}
}


