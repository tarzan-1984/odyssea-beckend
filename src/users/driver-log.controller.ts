import {
	Controller,
	ForbiddenException,
	Get,
	Query,
	Request,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { canAccessAppLogs } from '../common/user-role-access';
import { AuthenticatedRequest } from '../types/request.types';
import { DriverLogService } from './driver-log.service';

@ApiTags('Driver logs')
@ApiBearerAuth()
@Controller('driver-logs')
@UseGuards(JwtAuthGuard)
export class DriverLogController {
	constructor(private readonly driverLogService: DriverLogService) {}

	@Get()
	@ApiOperation({
		summary: 'List driver audit logs (administrators only)',
		description:
			'Paginated rows from driver_logs, sorted by created_at DESC. Search filters by driver_id.',
	})
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	@ApiQuery({
		name: 'search',
		required: false,
		type: String,
		description: 'Case-insensitive substring match against driver_id',
	})
	@ApiResponse({ status: 200, description: 'Paginated driver logs' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	async list(
		@Request() req: AuthenticatedRequest,
		@Query('page') page?: number,
		@Query('limit') limit?: number,
		@Query('search') search?: string,
	) {
		if (!canAccessAppLogs(req.user.role)) {
			throw new ForbiddenException(
				'Only administrators can view app logs',
			);
		}

		const pageNum = page ? Number(page) : 1;
		const limitNum = limit ? Number(limit) : 20;

		return this.driverLogService.findMany(pageNum, limitNum, search);
	}
}
