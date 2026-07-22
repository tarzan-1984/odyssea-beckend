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
import { LoadChatLogService } from './load-chat-log.service';

@ApiTags('Load chat logs')
@ApiBearerAuth()
@Controller('load-chats-logs')
@UseGuards(JwtAuthGuard)
export class LoadChatLogController {
	constructor(private readonly loadChatLogService: LoadChatLogService) {}

	@Get()
	@ApiOperation({
		summary: 'List load chat audit logs (administrators only)',
		description:
			'Paginated rows from load_chats_logs, sorted by created_at DESC.',
	})
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	@ApiQuery({
		name: 'search',
		required: false,
		type: String,
		description: 'Case-insensitive substring match against JSON data column',
	})
	@ApiResponse({ status: 200, description: 'Paginated load chat logs' })
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

		return this.loadChatLogService.findMany(pageNum, limitNum, search);
	}
}
