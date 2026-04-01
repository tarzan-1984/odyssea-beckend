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

@ApiTags('App settings')
@ApiBearerAuth()
@Controller('app-settings')
@UseGuards(JwtAuthGuard)
export class AppSettingsController {
	constructor(private readonly appSettingsService: AppSettingsService) {}

	@Get()
	@ApiOperation({
		summary: 'Get global app settings (location throttling for mobile clients)',
	})
	@ApiResponse({ status: 200, description: 'Current settings' })
	async get() {
		return this.appSettingsService.getGlobal();
	}

	@Put()
	@ApiOperation({ summary: 'Update global app settings (administrators only)' })
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
}
