import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	Post,
	Put,
	Request,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { AppSettingsService } from './app-settings.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateTmsBatchAppSettingsDto } from './dto/update-tms-batch-app-settings.dto';
import { UpdateLocationEnvironmentAppSettingsDto } from './dto/update-location-environment-app-settings.dto';
import { UpdateOffersAppSettingsDto } from './dto/update-offers-app-settings.dto';
import { UpdateDeliveredLoadChatAppSettingsDto } from './dto/update-delivered-load-chat-app-settings.dto';

@ApiTags('App settings')
@ApiBearerAuth()
@Controller('app-settings')
@UseGuards(JwtAuthGuard)
export class AppSettingsController {
	constructor(private readonly appSettingsService: AppSettingsService) {}

	@Get()
	@ApiOperation({
		summary:
			'Get mobile app settings: location throttling, environment gate (live/test), max concurrent offer bids',
	})
	@ApiResponse({ status: 200, description: 'Current mobile-related settings' })
	async get(@Request() req: AuthenticatedRequest) {
		void this.appSettingsService.recordUserLastActiveApp(req.user.id);
		return this.appSettingsService.getMobileAppSettings();
	}

	@Put()
	@ApiOperation({
		summary:
			'Update mobile app location throttling (administrators only). Does not change TMS batch backend settings.',
	})
	@ApiResponse({ status: 200, description: 'Updated settings' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	async update(
		@Request() req: AuthenticatedRequest,
		@Body() dto: UpdateAppSettingsDto,
	) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can update app settings',
			);
		}
		return this.appSettingsService.updateGlobal(dto);
	}

	@Get('tms-batch')
	@ApiOperation({
		summary: 'Get backend TMS batch location sync settings (admin UI)',
	})
	@ApiResponse({ status: 200, description: 'TMS batch interval and chunk size' })
	async getTmsBatch(@Request() req: AuthenticatedRequest) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can read TMS batch settings',
			);
		}
		return this.appSettingsService.getTmsBatchAppSettings();
	}

	@Put('tms-batch')
	@ApiOperation({
		summary:
			'Update backend TMS batch settings (administrators only). Does not change mobile throttling.',
	})
	@ApiResponse({ status: 200, description: 'Updated TMS batch settings' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	async updateTmsBatch(
		@Request() req: AuthenticatedRequest,
		@Body() dto: UpdateTmsBatchAppSettingsDto,
	) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can update TMS batch settings',
			);
		}
		return this.appSettingsService.updateTmsBatchAppSettings(dto);
	}

	@Get('location-environment')
	@ApiOperation({
		summary:
			'Get location environment (live vs test driver) — admin UI',
	})
	@ApiResponse({ status: 200, description: 'Mode and test driver external id' })
	async getLocationEnvironment(@Request() req: AuthenticatedRequest) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can read location environment settings',
			);
		}
		return this.appSettingsService.getLocationEnvironmentAppSettings();
	}

	@Put('location-environment')
	@ApiOperation({
		summary:
			'Set live (all drivers) or test (single driver external id only) — admin only',
	})
	@ApiResponse({ status: 200, description: 'Updated' })
	async updateLocationEnvironment(
		@Request() req: AuthenticatedRequest,
		@Body() dto: UpdateLocationEnvironmentAppSettingsDto,
	) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can update location environment settings',
			);
		}
		return this.appSettingsService.updateLocationEnvironmentAppSettings(dto);
	}

	@Get('offers')
	@ApiOperation({
		summary:
			'Get driver offer participation limit (admin UI) — max concurrent open bids',
	})
	@ApiResponse({ status: 200, description: 'Offers-related app settings' })
	async getOffers(@Request() req: AuthenticatedRequest) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can read offers app settings',
			);
		}
		return this.appSettingsService.getOffersAppSettings();
	}

	@Put('offers')
	@ApiOperation({
		summary:
			'Update max concurrent open bids per driver (admin only). Broadcasts appLocationSettingsUpdated.',
	})
	@ApiResponse({ status: 200, description: 'Updated' })
	async updateOffers(
		@Request() req: AuthenticatedRequest,
		@Body() dto: UpdateOffersAppSettingsDto,
	) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can update offers app settings',
			);
		}
		return this.appSettingsService.updateOffersAppSettings(dto);
	}

	@Get('delivered-load-chat')
	@ApiOperation({
		summary:
			'Hours after deliveryAt before LOAD chats get isLoadArchived=true (admin UI, cleanup cron)',
	})
	@ApiResponse({ status: 200, description: 'Delivered LOAD chat retention hours' })
	async getDeliveredLoadChat(@Request() req: AuthenticatedRequest) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can read delivered LOAD chat settings',
			);
		}
		return this.appSettingsService.getDeliveredLoadChatAppSettings();
	}

	@Put('delivered-load-chat')
	@ApiOperation({
		summary:
			'Update hours after deliveryAt before cron sets isLoadArchived on LOAD chats (admin only)',
	})
	@ApiResponse({ status: 200, description: 'Updated' })
	async updateDeliveredLoadChat(
		@Request() req: AuthenticatedRequest,
		@Body() dto: UpdateDeliveredLoadChatAppSettingsDto,
	) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can update delivered LOAD chat settings',
			);
		}
		return this.appSettingsService.updateDeliveredLoadChatAppSettings(dto);
	}

	@Get('usage-stats')
	@ApiOperation({
		summary:
			'Get mobile app usage stats (ACTIVE users with a device snapshot) — admin UI',
	})
	@ApiResponse({ status: 200, description: 'Usage stats split by role and platform' })
	async getUsageStats(@Request() req: AuthenticatedRequest) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can read usage stats',
			);
		}
		return {
			data: await this.appSettingsService.getMobileUsageStats(),
			timestamp: new Date().toISOString(),
			path: '/v1/app-settings/usage-stats',
		};
	}

	@Get('account-deletion-request')
	@ApiOperation({
		summary: 'Get account deletion request email recipient (admin UI)',
	})
	@ApiResponse({ status: 200, description: 'Current recipient email' })
	async getAccountDeletionRequest(@Request() req: AuthenticatedRequest) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can read account deletion request settings',
			);
		}
		return this.appSettingsService.getAccountDeletionRequestSettings();
	}

	@Put('account-deletion-request')
	@ApiOperation({
		summary: 'Update account deletion request email recipient (admin only)',
	})
	@ApiResponse({ status: 200, description: 'Updated recipient email' })
	async updateAccountDeletionRequest(
		@Request() req: AuthenticatedRequest,
		@Body() body: { accountDeletionRequestEmail: string },
	) {
		if (req.user.role !== UserRole.ADMINISTRATOR) {
			throw new ForbiddenException(
				'Only administrators can update account deletion request settings',
			);
		}
		return this.appSettingsService.updateAccountDeletionRequestSettings(body);
	}
}
