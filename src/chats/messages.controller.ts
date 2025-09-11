import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	Query,
	UseGuards,
	Request,
	UseInterceptors,
	UploadedFile,
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
	ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { FileUploadService } from './file-upload.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatGateway } from './chat.gateway';
import { AuthenticatedRequest } from '../types/request.types';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessagesController {
	constructor(
		private readonly messagesService: MessagesService,
		private readonly fileUploadService: FileUploadService,
		private readonly chatGateway: ChatGateway,
	) {}

	@Post()
	@ApiOperation({
		summary: 'Send a message',
		description:
			'Send a text message to a chat room. File attachments are supported.',
	})
	@ApiResponse({
		status: 201,
		description: 'Message sent successfully',
		schema: {
			example: {
				id: 'message_123',
				chatRoomId: 'chat_room_123',
				senderId: 'user_1',
				receiverId: 'user_2',
				content: 'Hello! How is the delivery going?',
				fileUrl: null,
				fileName: null,
				fileSize: null,
				isRead: false,
				createdAt: '2024-01-15T11:00:00Z',
				sender: {
					id: 'user_1',
					firstName: 'John',
					lastName: 'Doe',
					profilePhoto: 'https://example.com/photo1.jpg',
					role: 'DRIVER',
				},
				receiver: {
					id: 'user_2',
					firstName: 'Jane',
					lastName: 'Smith',
					profilePhoto: 'https://example.com/photo2.jpg',
					role: 'FLEET_MANAGER',
				},
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - invalid data or user not participant',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	async sendMessage(
		@Body() sendMessageDto: SendMessageDto,
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		const message = await this.messagesService.sendMessage(
			sendMessageDto,
			userId,
		);

		// Broadcast message via WebSocket to all participants
		this.chatGateway.broadcastMessage(sendMessageDto.chatRoomId, message);

		return message;
	}

	@Post('upload')
	@UseInterceptors(FileInterceptor('file'))
	@ApiOperation({
		summary: 'Upload file for chat',
		description:
			'Upload a file that can be attached to a message. Supports images, PDFs, and text files.',
	})
	@ApiConsumes('multipart/form-data')
	@ApiResponse({
		status: 201,
		description: 'File uploaded successfully',
		schema: {
			example: {
				url: 'https://drive.google.com/file/d/file_id/view',
				fileName: 'delivery_photo.jpg',
				fileSize: 1024000,
				mimeType: 'image/jpeg',
				uploadProvider: 'google-drive',
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - invalid file type or size',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	async uploadFile(
		@UploadedFile() file: Express.Multer.File,
		@Request() _req: AuthenticatedRequest,
	) {
		// Validate file
		this.fileUploadService.validateFile(file);

		// Upload file
		const result = await this.fileUploadService.uploadFile(
			file,
			'chat-files',
		);

		return result;
	}

	@Get('chat-room/:chatRoomId')
	@ApiOperation({
		summary: 'Get chat room messages',
		description:
			'Retrieve messages for a specific chat room with pagination support.',
	})
	@ApiParam({
		name: 'chatRoomId',
		description: 'Chat room ID',
		example: 'chat_room_123',
	})
	@ApiQuery({
		name: 'page',
		description: 'Page number for pagination',
		example: 1,
		required: false,
	})
	@ApiQuery({
		name: 'limit',
		description: 'Number of messages per page',
		example: 50,
		required: false,
	})
	@ApiResponse({
		status: 200,
		description: 'Messages retrieved successfully',
		schema: {
			example: {
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
							role: 'DRIVER',
						},
						receiver: {
							id: 'user_2',
							firstName: 'Jane',
							lastName: 'Smith',
							profilePhoto: 'https://example.com/photo2.jpg',
							role: 'FLEET_MANAGER',
						},
					},
				],
				pagination: {
					page: 1,
					limit: 50,
					total: 1,
					pages: 1,
				},
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
	async getChatRoomMessages(
		@Param('chatRoomId') chatRoomId: string,
		@Query('page') page: number = 1,
		@Query('limit') limit: number = 50,
		@Request() req: AuthenticatedRequest,
	) {
		console.log('chatRoomId = ', chatRoomId);

		const userId = req.user.id;
		return await this.messagesService.getChatRoomMessages(
			chatRoomId,
			userId,
			page,
			limit,
		);
	}

	@Get('search/:chatRoomId')
	@ApiOperation({
		summary: 'Search messages in chat room',
		description:
			'Search for specific text in chat room messages. Useful for finding information in chat history.',
	})
	@ApiParam({
		name: 'chatRoomId',
		description: 'Chat room ID',
		example: 'chat_room_123',
	})
	@ApiQuery({
		name: 'query',
		description: 'Search query',
		example: 'delivery status',
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
		description: 'Search results retrieved successfully',
		schema: {
			example: {
				messages: [
					{
						id: 'message_123',
						content:
							'The delivery status is confirmed for tomorrow',
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
							role: 'DRIVER',
						},
					},
				],
				pagination: {
					page: 1,
					limit: 20,
					total: 1,
					pages: 1,
				},
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
	async searchMessages(
		@Param('chatRoomId') chatRoomId: string,
		@Query('query') query: string,
		@Query('page') page: number = 1,
		@Query('limit') limit: number = 20,
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		return await this.messagesService.searchMessages(
			chatRoomId,
			userId,
			query,
			page,
			limit,
		);
	}

	@Get('stats/:chatRoomId')
	@ApiOperation({
		summary: 'Get message statistics',
		description:
			'Retrieve statistics about messages in a chat room. Useful for managers to monitor communication activity.',
	})
	@ApiParam({
		name: 'chatRoomId',
		description: 'Chat room ID',
		example: 'chat_room_123',
	})
	@ApiResponse({
		status: 200,
		description: 'Statistics retrieved successfully',
		schema: {
			example: {
				totalMessages: 150,
				messagesToday: 5,
				messagesThisWeek: 25,
				fileMessages: 10,
				averageMessagesPerDay: 3.2,
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
	async getMessageStats(
		@Param('chatRoomId') chatRoomId: string,
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		return await this.messagesService.getMessageStats(chatRoomId, userId);
	}

	@Get('unread/count')
	@ApiOperation({
		summary: 'Get unread message count',
		description:
			'Get total count of unread messages for the authenticated user across all chat rooms.',
	})
	@ApiResponse({
		status: 200,
		description: 'Unread count retrieved successfully',
		schema: {
			example: {
				unreadCount: 5,
			},
		},
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	async getUnreadCount(@Request() req: AuthenticatedRequest) {
		const userId = req.user.id;
		return await this.messagesService.getUnreadCount(userId);
	}

	@Put(':id/read')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Mark message as read',
		description:
			'Mark a specific message as read by the authenticated user.',
	})
	@ApiParam({
		name: 'id',
		description: 'Message ID',
		example: 'message_123',
	})
	@ApiResponse({
		status: 200,
		description: 'Message marked as read successfully',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	@ApiResponse({
		status: 404,
		description: 'Message not found',
	})
	markMessageAsRead(
		@Param('id') id: string,
		@Request() req: AuthenticatedRequest,
	) {
		const _userId = req.user.id;
		// This will be implemented in MessagesService
		return { success: true, messageId: id };
	}

	@Delete(':id')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Delete message',
		description:
			'Delete a message. Only the sender can delete their own messages.',
	})
	@ApiParam({
		name: 'id',
		description: 'Message ID',
		example: 'message_123',
	})
	@ApiResponse({
		status: 200,
		description: 'Message deleted successfully',
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - cannot delete message',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid or missing JWT token',
	})
	@ApiResponse({
		status: 404,
		description: 'Message not found',
	})
	async deleteMessage(
		@Param('id') id: string,
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		return await this.messagesService.deleteMessage(id, userId);
	}
}
