import {
	Controller,
	Post,
	Body,
	UseGuards,
	HttpCode,
	HttpStatus,
	BadRequestException,
	Logger,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBody,
	ApiSecurity,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { WebhookSyncDto } from './dto/webhook-sync.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@ApiTags('Sync')
@ApiSecurity('api-key') // For external service authentication
@Controller('sync-db')
@UseGuards(ApiKeyGuard)
export class SyncController {
	private readonly logger = new Logger(SyncController.name);

	constructor(private readonly usersService: UsersService) {}

	@Post()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Sync user data from TMS webhook',
		description:
			'This endpoint processes webhook data from TMS system for drivers and employees. Supports add, update, and delete operations.',
	})
	@ApiBody({
		type: WebhookSyncDto,
		description: 'Webhook data from TMS system',
	})
	@ApiResponse({
		status: 200,
		description: 'Webhook processed successfully',
		schema: {
			type: 'object',
			properties: {
				action: {
					type: 'string',
					enum: ['created', 'updated', 'deleted'],
					description: 'Action performed on the user data',
				},
				user: {
					type: 'object',
					description: 'User data (for create/update operations)',
					properties: {
						id: { type: 'string', description: 'Internal user ID' },
						externalId: {
							type: 'string',
							description: 'External service user ID',
						},
						email: { type: 'string', description: 'User email' },
						firstName: {
							type: 'string',
							description: 'User first name',
						},
						lastName: {
							type: 'string',
							description: 'User last name',
						},
						phone: {
							type: 'string',
							description: 'User phone number',
						},
						location: {
							type: 'string',
							description: 'User location',
						},
						role: { type: 'string', description: 'User role' },
						status: { type: 'string', description: 'User status' },
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
					},
				},
				externalId: {
					type: 'string',
					description: 'External ID (for delete operations)',
				},
				message: {
					type: 'string',
					description: 'Success message (for delete operations)',
				},
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - invalid data provided',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid API key',
	})
	async processWebhook(@Body() webhookData: WebhookSyncDto) {
		this.logger.log('📥 [Webhook] Received webhook request');
		this.logger.log('📋 [Webhook] Request body:');
		this.logger.log(JSON.stringify(webhookData, null, 2));
		
		try {
			return await this.usersService.processWebhookSync(webhookData);
		} catch (error) {
			this.logger.error('❌ [Webhook] Error processing webhook:', error);
			if (error instanceof BadRequestException) {
				const errorResponse = error.getResponse();
				this.logger.error(`❌ [Webhook] BadRequest details: ${JSON.stringify(errorResponse, null, 2)}`);
			}
			throw error;
		}
	}
}
