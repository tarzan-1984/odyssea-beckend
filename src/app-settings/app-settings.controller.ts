import {
	Body,
	Controller,
	ForbiddenException,
	Get,
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

@ApiTags('App settings')
@ApiBearerAuth()
@Controller('app-settings')
@UseGuards(JwtAuthGuard)
export class AppSettingsController {
	constructor(private readonly appSettingsService: AppSettingsService) {}

	@Get()
	@ApiOperation({
		summary:
			'Get mobile app location throttling settings (interval, distance, reverse geocode)',
	})
	@ApiResponse({ status: 200, description: 'Current mobile-related settings' })
	async get() {
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
}
