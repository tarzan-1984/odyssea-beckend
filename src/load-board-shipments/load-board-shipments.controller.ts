import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	Param,
	ParseIntPipe,
	Patch,
	Post,
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
import { canAccessLoadBoard } from '../common/user-role-access';
import { AuthenticatedRequest } from '../types/request.types';
import { CreateLoadBoardShipmentDto } from './dto/create-load-board-shipment.dto';
import {
	LoadBoardAgeSort,
	LoadBoardShipmentsService,
} from './load-board-shipments.service';

@ApiTags('Load board shipments')
@ApiBearerAuth()
@Controller('load-board-shipments')
@UseGuards(JwtAuthGuard)
export class LoadBoardShipmentsController {
	constructor(
		private readonly loadBoardShipmentsService: LoadBoardShipmentsService,
	) {}

	@Get()
	@ApiOperation({
		summary: 'List load board shipments',
		description: 'Paginated list sorted by Age (createdAt). Default: newest first.',
	})
	@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
	@ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
	@ApiQuery({
		name: 'ageSort',
		required: false,
		enum: ['asc', 'desc'],
		example: 'desc',
		description: 'desc = newest first, asc = oldest first',
	})
	@ApiResponse({ status: 200, description: 'Shipments list' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	async findAll(
		@Request() req: AuthenticatedRequest,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
		@Query('ageSort') ageSort?: string,
	) {
		if (!canAccessLoadBoard(req.user.role)) {
			throw new ForbiddenException('You do not have access to load board');
		}

		const normalizedSort: LoadBoardAgeSort =
			ageSort === 'asc' ? 'asc' : 'desc';

		return this.loadBoardShipmentsService.findAll(
			page ? Number(page) : 1,
			limit ? Number(limit) : 10,
			normalizedSort,
		);
	}

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

	@Patch(':id')
	@ApiOperation({
		summary: 'Update a load board shipment',
		description:
			'Updates an existing load_board_shipments row from the Edit Shipment form.',
	})
	@ApiResponse({ status: 200, description: 'Shipment updated' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: CreateLoadBoardShipmentDto,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessLoadBoard(req.user.role)) {
			throw new ForbiddenException('You do not have access to load board');
		}

		return this.loadBoardShipmentsService.update(id, dto);
	}
}
