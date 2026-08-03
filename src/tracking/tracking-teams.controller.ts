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
import {
	canAccessMyTeamChatTab,
	canAccessTrackingTeamsApi,
} from '../common/user-role-access';
import { AuthenticatedRequest } from '../types/request.types';
import { TrackingTeamsService } from './tracking-teams.service';

@ApiTags('tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tracking/teams')
export class TrackingTeamsController {
	constructor(private readonly trackingTeamsService: TrackingTeamsService) {}

	@Get()
	@ApiOperation({
		summary: 'TMS tracking/teams load ids for the current user',
		description:
			'Proxies Endurance TMS GET /tracking/teams using the authenticated user externalId. Optional include_subordinates=1 for My Team. Results are cached in memory up to 24h.',
	})
	@ApiQuery({
		name: 'include_subordinates',
		required: false,
		description: 'Set to 1/true for My Team (subordinates). Omit for My Loads.',
	})
	@ApiQuery({
		name: 'refresh',
		required: false,
		description: 'Set to 1/true to bypass server cache and refetch from TMS.',
	})
	@ApiResponse({ status: 200, description: 'Load ids for filtering LOAD chats' })
	async getTeams(
		@Request() req: AuthenticatedRequest,
		@Query('include_subordinates') includeSubordinatesRaw?: string,
		@Query('refresh') refreshRaw?: string,
	) {
		if (!canAccessTrackingTeamsApi(req.user.role)) {
			throw new ForbiddenException('Forbidden');
		}

		const includeSubordinates = this.parseFlag(includeSubordinatesRaw);
		if (includeSubordinates && !canAccessMyTeamChatTab(req.user.role)) {
			throw new ForbiddenException('My Team is not available for this role');
		}

		const bypassCache = this.parseFlag(refreshRaw);
		const result = await this.trackingTeamsService.getLoadIdsForUser(
			req.user.id,
			includeSubordinates,
			{ bypassCache },
		);

		return {
			success: true,
			loadIds: result.loadIds,
			total: result.total,
			includeSubordinates,
			cached: result.cached,
		};
	}

	private parseFlag(value?: string): boolean {
		const normalized = String(value ?? '')
			.trim()
			.toLowerCase();
		return normalized === '1' || normalized === 'true' || normalized === 'yes';
	}
}
