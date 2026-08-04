import {
	Body,
	Controller,
	ForbiddenException,
	Post,
	Request,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { canAccessLoadBoard } from '../common/user-role-access';
import { AuthenticatedRequest } from '../types/request.types';
import { CreateLoadBoardShipmentDto } from './dto/create-load-board-shipment.dto';
import { LoadBoardShipmentsService } from './load-board-shipments.service';

@ApiTags('Load board shipments')
@ApiBearerAuth()
@Controller('load-board-shipments')
@UseGuards(JwtAuthGuard)
export class LoadBoardShipmentsController {
	constructor(
		private readonly loadBoardShipmentsService: LoadBoardShipmentsService,
	) {}

	@Post()
	@ApiOperation({
		summary: 'Create a load board shipment post',
		description:
			'Creates a load_board_shipments row from the New Shipment form. Owner is the authenticated user.',
	})
	@ApiResponse({ status: 201, description: 'Shipment created' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	async create(
		@Body() dto: CreateLoadBoardShipmentDto,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessLoadBoard(req.user.role)) {
			throw new ForbiddenException('You do not have access to load board');
		}

		return this.loadBoardShipmentsService.create(dto, req.user.id);
	}
}
