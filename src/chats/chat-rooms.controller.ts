import {
	Controller,
	Get,
	Post,
	Put,
	Body,
	Param,
	Query,
	UseGuards,
	Request,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiParam,
	ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatRoomsService } from './chat-rooms.service';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { AuthenticatedRequest } from '../types/request.types';

@ApiTags('Chat Rooms')
@Controller('chat-rooms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatRoomsController {
	constructor(private readonly chatRoomsService: ChatRoomsService) {}

	@Post()
	@ApiOperation({
		summary: 'Create a new chat room',
		description:
			'Create a new chat room and add participants. Supports direct chats between two users and group chats.',
	})
	@ApiResponse({
		status: 201,
		description: 'Chat room created successfully',
		schema: {
			example: {
				id: 'chat_room_123',
				name: 'John Doe & Jane Smith',
				type: 'DIRECT',
				loadId: null,
				createdAt: '2024-01-15T10:30:00Z',
				updatedAt: '2024-01-15T10:30:00Z',
				participants: [
					{
						id: 'participant_1',
						userId: 'user_1',
						joinedAt: '2024-01-15T10:30:00Z',
						user: {
							id: 'user_1',
							firstName: 'John',
							lastName: 'Doe',
							role: 'DRIVER',
							profilePhoto: 'https://example.com/photo1.jpg',
						},
					},
				],
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - invalid data or business logic error',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	async createChatRoom(
		@Body() createChatRoomDto: CreateChatRoomDto,
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		return await this.chatRoomsService.createChatRoom(
			createChatRoomDto,
			userId,
		);
	}

	@Get()
	@ApiOperation({
		summary: 'Get user chat rooms',
		description:
			'Retrieve all chat rooms for the authenticated user with last message and unread count.',
	})
	@ApiResponse({
		status: 200,
		description: 'Chat rooms retrieved successfully',
		schema: {
			example: [
				{
					id: 'chat_room_123',
					name: 'John Doe & Jane Smith',
					type: 'DIRECT',
					loadId: null,
					createdAt: '2024-01-15T10:30:00Z',
					updatedAt: '2024-01-15T10:30:00Z',
					participants: [
						{
							id: 'participant_1',
							userId: 'user_1',
							joinedAt: '2024-01-15T10:30:00Z',
							user: {
								id: 'user_1',
								firstName: 'John',
								lastName: 'Doe',
								role: 'DRIVER',
								profilePhoto: 'https://example.com/photo1.jpg',
							},
						},
					],
					lastMessage: {
						id: 'message_123',
						content: 'Hello! How is the delivery going?',
						createdAt: '2024-01-15T11:00:00Z',
						sender: {
							id: 'user_1',
							firstName: 'John',
							lastName: 'Doe',
						},
					},
					unreadCount: 2,
				},
			],
		},
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	async getUserChatRooms(@Request() req: AuthenticatedRequest) {
		const userId = req.user.id;
		return await this.chatRoomsService.getUserChatRooms(userId);
	}

	@Get(':id')
	@ApiOperation({
		summary: 'Get specific chat room',
		description:
			'Retrieve a specific chat room with all messages and participants.',
	})
	@ApiParam({
		name: 'id',
		description: 'Chat room ID',
		example: 'chat_room_123',
	})
	@ApiResponse({
		status: 200,
		description: 'Chat room retrieved successfully',
		schema: {
			example: {
				id: 'chat_room_123',
				name: 'John Doe & Jane Smith',
				type: 'DIRECT',
				loadId: null,
				createdAt: '2024-01-15T10:30:00Z',
				updatedAt: '2024-01-15T10:30:00Z',
				participants: [
					{
						id: 'participant_1',
						userId: 'user_1',
						joinedAt: '2024-01-15T10:30:00Z',
						user: {
							id: 'user_1',
							firstName: 'John',
							lastName: 'Doe',
							role: 'DRIVER',
							profilePhoto: 'https://example.com/photo1.jpg',
						},
					},
				],
				messages: [
					{
						id: 'message_123',
						content: 'Hello! How is the delivery going?',
						fileUrl: null,
						fileName: null,
						fileSize: null,
						isRead: true,
						createdAt: '2024-01-15T11:00:00Z',
						sender: {
							id: 'user_1',
							firstName: 'John',
							lastName: 'Doe',
							profilePhoto: 'https://example.com/photo1.jpg',
						},
						receiver: {
							id: 'user_2',
							firstName: 'Jane',
							lastName: 'Smith',
							profilePhoto: 'https://example.com/photo2.jpg',
						},
					},
				],
			},
		},
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	@ApiResponse({
		status: 404,
		description: 'Chat room not found or access denied',
	})
	async getChatRoom(
		@Param('id') id: string,
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		return await this.chatRoomsService.getChatRoom(id, userId);
	}

	@Put(':id/archive')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Archive chat room',
		description:
			'Archive (soft delete) a chat room. Archived rooms are hidden from the main chat list.',
	})
	@ApiParam({
		name: 'id',
		description: 'Chat room ID',
		example: 'chat_room_123',
	})
	@ApiResponse({
		status: 200,
		description: 'Chat room archived successfully',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	@ApiResponse({
		status: 404,
		description: 'Chat room not found or access denied',
	})
	async archiveChatRoom(
		@Param('id') id: string,
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		return await this.chatRoomsService.archiveChatRoom(id, userId);
	}

	@Post(':id/participants')
	@ApiOperation({
		summary: 'Add participants to chat room',
		description:
			'Add new participants to an existing chat room. Only current participants can add others.',
	})
	@ApiParam({
		name: 'id',
		description: 'Chat room ID',
		example: 'chat_room_123',
	})
	@ApiResponse({
		status: 201,
		description: 'Participants added successfully',
		schema: {
			example: [
				{
					id: 'participant_2',
					userId: 'user_3',
					joinedAt: '2024-01-15T12:00:00Z',
					user: {
						id: 'user_3',
						firstName: 'Mike',
						lastName: 'Johnson',
						role: 'FLEET_MANAGER',
						profilePhoto: 'https://example.com/photo3.jpg',
					},
				},
			],
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - invalid data',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	@ApiResponse({
		status: 404,
		description: 'Chat room not found or access denied',
	})
	async addParticipants(
		@Param('id') id: string,
		@Body() body: { participantIds: string[] },
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		return await this.chatRoomsService.addParticipants(
			id,
			body.participantIds,
			userId,
		);
	}

	@Get('search/users')
	@ApiOperation({
		summary: 'Search users for chat',
		description:
			'Search for users to start a chat with. Useful for finding drivers or managers.',
	})
	@ApiQuery({
		name: 'query',
		description: 'Search query (name, email, or role)',
		example: 'john driver',
	})
	@ApiQuery({
		name: 'role',
		description: 'Filter by user role',
		example: 'DRIVER',
		required: false,
	})
	@ApiQuery({
		name: 'page',
		description: 'Page number for pagination',
		example: 1,
		required: false,
	})
	@ApiQuery({
		name: 'limit',
		description: 'Number of results per page',
		example: 20,
		required: false,
	})
	@ApiResponse({
		status: 200,
		description: 'Users found successfully',
		schema: {
			example: [
				{
					id: 'user_1',
					firstName: 'John',
					lastName: 'Doe',
					email: 'john.doe@example.com',
					role: 'DRIVER',
					profilePhoto: 'https://example.com/photo1.jpg',
					status: 'ACTIVE',
				},
			],
		},
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	searchUsers(
		@Query('query') query: string,
		@Query('role') role?: string,
		@Query('page') _page: number = 1,
		@Query('limit') _limit: number = 20,
	) {
		// This method will be implemented to search users
		// For now, return empty array
		return [];
	}
}
