import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatRoomsService } from './chat-rooms.service';
import { UpdateLoadChatDto } from './dto/update-load-chat.dto';
import { ChatGateway } from './chat.gateway';

@ApiTags('Load Chat')
@Controller('update_load_chat')
export class UpdateLoadChatController {
  constructor(
    private readonly chatRoomsService: ChatRoomsService,
    private readonly chatGateway: ChatGateway,
  ) {}

	@Post()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update LOAD chat participants by load_id',
		description:
			'Finds LOAD chat by load_id and syncs participants with the provided list. Hidden participants (hideParticipant=true) remain unchanged.',
	})
	@ApiResponse({ status: 200, description: 'Participants updated successfully' })
	async update(@Body() dto: UpdateLoadChatDto) {
		const { chatRoomId, newParticipants, addedUserIds, removedUserIds, notFoundExternalIds } =
			await this.chatRoomsService.updateLoadChatParticipants(dto);

		// Emit WebSocket events for added and removed participants
		if (addedUserIds.length > 0 && newParticipants.length > 0) {
			this.chatGateway.server
				.to(`chat_${chatRoomId}`)
				.emit('participantsAdded', { chatRoomId, newParticipants, addedBy: 'system' });
			for (const userId of addedUserIds) {
				const socketId = this.chatGateway['userSockets']?.get?.(userId);
				if (socketId) {
					this.chatGateway.server
						.to(socketId)
						.emit('addedToChatRoom', { chatRoomId, addedBy: 'system' });
				}
			}
		}

		for (const removedId of removedUserIds) {
			this.chatGateway.server
				.to(`chat_${chatRoomId}`)
				.emit('participantRemoved', { chatRoomId, removedUserId: removedId, removedBy: 'system' });
			const socketId = this.chatGateway['userSockets']?.get?.(removedId);
			if (socketId) {
				this.chatGateway.server
					.to(socketId)
					.emit('removedFromChatRoom', { chatRoomId, removedBy: 'system' });
			}
		}

		return { updated: true, chatRoomId, addedUserIds, removedUserIds, notFoundExternalIds };
	}

}


