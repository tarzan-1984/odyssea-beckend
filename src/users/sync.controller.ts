import {
	Controller,
	Post,
	Body,
	UseGuards,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBody,
	ApiSecurity,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { SyncUserDto } from './dto/sync-user.dto';
import { WebhookSyncDto } from './dto/webhook-sync.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@ApiTags('Sync')
@ApiSecurity('api-key') // For external service authentication
@Controller('sync-db')
@UseGuards(ApiKeyGuard)
export class SyncController {
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
		return this.usersService.processWebhookSync(webhookData);
	}

	@Post('legacy')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Legacy sync user data from external service',
		description:
			'Legacy endpoint for backward compatibility. Use the main endpoint for TMS webhook integration.',
	})
	@ApiBody({
		type: SyncUserDto,
		description: 'User data to sync from external service',
	})
	@ApiResponse({
		status: 200,
		description: 'User data synced successfully',
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - invalid data provided',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized - invalid API key',
	})
	async syncUser(@Body() syncUserDto: SyncUserDto) {
		return this.usersService.syncUser(syncUserDto);
	}
}
