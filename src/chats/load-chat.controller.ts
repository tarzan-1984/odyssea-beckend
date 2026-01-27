import { Controller, Post, Body, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
} from '@nestjs/swagger';
import { ChatRoomsService } from './chat-rooms.service';
import { CreateLoadChatDto } from './dto/create-load-chat.dto';
import { UpdateLoadChatDto } from './dto/update-load-chat.dto';
import { ChatGateway } from './chat.gateway';

@ApiTags('Load Chat')
@Controller('create_load_chat')
export class LoadChatController {
	constructor(
		private readonly chatRoomsService: ChatRoomsService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
	) {}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary: 'Create a LOAD chat',
		description:
			'Creates a new LOAD chat with external participants. Verifies driver exists and is active, then creates chat with all valid participants plus ADMINISTRATOR users (hidden).',
	})
	@ApiResponse({
		status: 201,
		description: 'Load chat created successfully',
		schema: {
			example: {
				id: 'chat_room_xyz',
				name: 'Load #12345 Discussion',
				type: 'LOAD',
				loadId: 'load_12345',
				company: 'Odysseia',
				avatar: null,
				isArchived: false,
				adminId: null,
				createdAt: '2025-10-19T18:00:00.000Z',
				updatedAt: '2025-10-19T18:00:00.000Z',
				participants: [
					{
						id: 'participant_1',
						userId: 'driver_user_id',
						chatRoomId: 'chat_room_xyz',
						joinedAt: '2025-10-19T18:00:00.000Z',
						isHidden: false,
						user: {
							id: 'driver_user_id',
							firstName: 'John',
							lastName: 'Doe',
							email: 'john@example.com',
							role: 'DRIVER',
							profilePhoto: null,
						},
					},
				],
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - driver not found, inactive, or missing',
	})
	async createLoadChat(@Body() createLoadChatDto: CreateLoadChatDto) {
		const chatRoom = await this.chatRoomsService.createLoadChat(
			createLoadChatDto,
		);

		// Emit WebSocket event to all participants
		if (chatRoom && chatRoom.participants) {
			console.log(`📡 Отправляем WebSocket событие для ${chatRoom.participants.length} участников`);
			for (const participant of chatRoom.participants) {
				console.log(`📡 Отправляем chatRoomCreated в комнату user_${participant.userId}`);
				// Emit to each participant's room (using the correct room name format)
				this.chatGateway.server
					.to(`user_${participant.userId}`)
					.emit('chatRoomCreated', chatRoom);
			}
		} else {
			console.log('❌ Нет участников для отправки WebSocket события');
		}

		return chatRoom;
	}

	@Post('update')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update LOAD chat participants by load_id',
		description:
			'Finds LOAD chat by load_id and syncs participants with the provided list. Hidden participants (hideParticipant=true) remain unchanged.',
	})
	@ApiResponse({ status: 200, description: 'Participants updated successfully' })
	async updateLoadChat(@Body() dto: UpdateLoadChatDto) {
		const result = await this.chatRoomsService.updateLoadChatParticipants(dto);

		// Emit WebSocket events for added and removed participants
		const { chatRoomId, newParticipants, addedUserIds, removedUserIds, notFoundExternalIds } = result;

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

