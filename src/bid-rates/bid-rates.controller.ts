import {
	Body,
	Controller,
	Delete,
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
import { canAccessBidRates } from '../common/user-role-access';
import { AuthenticatedRequest } from '../types/request.types';
import { ChatGateway } from '../chats/chat.gateway';
import { BidRatesService } from './bid-rates.service';
import { CreateBidRateDto } from './dto/create-bid-rate.dto';
import { UpdateBidRatePriceDto } from './dto/update-bid-rate-price.dto';

@ApiTags('Bid rates')
@ApiBearerAuth()
@Controller('bid-rates')
@UseGuards(JwtAuthGuard)
export class BidRatesController {
	constructor(
		private readonly bidRatesService: BidRatesService,
		private readonly chatGateway: ChatGateway,
	) {}

	@Get()
	@ApiOperation({ summary: 'List bid rates with owner and route' })
	@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
	@ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
	@ApiResponse({ status: 200, description: 'Bid rates list' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	async findAll(
		@Request() req: AuthenticatedRequest,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.findAll(
			page ? Number(page) : 1,
			limit ? Number(limit) : 10,
		);
	}

	@Post()
	@ApiOperation({
		summary: 'Create bid rate and linked BID chat',
		description:
			'Creates a bid_rates row and a BID chat with dispatchers, expedite managers, and administrators (externalId 20 and 83 only; 83 is hidden).',
	})
	@ApiResponse({ status: 201, description: 'Bid rate created' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	async create(
		@Body() dto: CreateBidRateDto,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		const { bidRate, chatRoom, participantIds } =
			await this.bidRatesService.create(dto, req.user.id);

		if (chatRoom) {
			this.chatGateway.notifyChatRoomCreated(chatRoom, participantIds);
		}

		return bidRate;
	}

	@Get('by-chat/:chatRoomId/participation')
	@ApiOperation({
		summary: 'Check if current user already joined bid (+1 locked)',
		description:
			'Looks up bid_rates by chatId and returns whether bid_rate_participants has a row for this user.',
	})
	@ApiResponse({ status: 200, description: 'Participation status' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Bid not found' })
	async getParticipationByChat(
		@Param('chatRoomId') chatRoomId: string,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.getParticipationByChatId(
			chatRoomId,
			req.user.id,
		);
	}

	@Post('by-chat/:chatRoomId/join')
	@ApiOperation({
		summary: 'Join bid via +1 (once per user)',
		description:
			'Creates bid_rate_participants row for the current user. Idempotent if already joined.',
	})
	@ApiResponse({ status: 200, description: 'Joined (or already joined)' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Bid not found' })
	async joinByChat(
		@Param('chatRoomId') chatRoomId: string,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.joinByChatId(chatRoomId, req.user.id);
	}

	@Get('by-chat/:chatRoomId/participants')
	@ApiOperation({
		summary: 'List bid auction participants for +1 timers',
		description:
			'Returns bid_rate_participants rows (userId, createdAt, updatedAt) for the bid linked to this chat.',
	})
	@ApiResponse({ status: 200, description: 'Participants list' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Bid not found' })
	async listParticipantsByChat(
		@Param('chatRoomId') chatRoomId: string,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.listParticipantsByChatId(chatRoomId);
	}

	@Post('by-chat/:chatRoomId/extend-participant-time')
	@ApiOperation({
		summary: 'Extend participant +1 timer by 15 minutes',
		description:
			'Adds 15 minutes to bid_rate_participants.updated_at (NY wall-clock). Max 3 extends. Allowed for the participant or bid owner.',
	})
	@ApiResponse({ status: 200, description: 'Participant timer extended' })
	@ApiResponse({ status: 400, description: 'Cannot extend' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async extendParticipantTimeByChat(
		@Param('chatRoomId') chatRoomId: string,
		@Body() body: { userId?: string },
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.extendParticipantTimeByChatId(
			chatRoomId,
			req.user.id,
			body?.userId,
		);
	}

	@Post(':id/extend-time')
	@ApiOperation({
		summary: 'Extend bid timer by 15 minutes',
		description:
			'Adds 15 minutes to updated_at (NY wall-clock). Allowed up to 3 times for the creator only.',
	})
	@ApiResponse({ status: 200, description: 'Bid timer extended' })
	@ApiResponse({ status: 400, description: 'Cannot extend' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async extendTime(
		@Param('id', ParseIntPipe) id: number,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.extendTime(id, req.user.id);
	}

	@Patch(':id/new-price')
	@ApiOperation({
		summary: 'Update bid price',
		description:
			'Creator only. Writes to rate if no +1 participants exist; otherwise writes to new_price.',
	})
	@ApiResponse({ status: 200, description: 'Bid price updated' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async updateNewPrice(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateBidRatePriceDto,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.updateNewPrice(id, req.user.id, dto);
	}

	@Get(':id/participants')
	@ApiOperation({
		summary: 'List bid auction participants (+1) for a bid',
		description:
			'Returns bid_rate_participants with names and timestamps for the popup on the bid card.',
	})
	@ApiResponse({ status: 200, description: 'Participants list' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async listParticipantsByBid(
		@Param('id', ParseIntPipe) id: number,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.listParticipantsByBidId(id);
	}

	@Delete(':id')
	@ApiOperation({
		summary: 'Delete bid rate and linked BID chat',
		description:
			'Hard-deletes the bid_rates row and related BID chat room without archiving messages.',
	})
	@ApiResponse({ status: 200, description: 'Bid rate deleted' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async remove(
		@Param('id', ParseIntPipe) id: number,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		const result = await this.bidRatesService.remove(id, req.user.id);

		if (result.deletedChatId) {
			const payload = {
				chatRoomId: result.deletedChatId,
				deletedBy: req.user.id,
			};
			const notified = new Set<string>();

			for (const participantId of result.participantIds) {
				notified.add(participantId);
				this.chatGateway.server
					.to(`user_${participantId}`)
					.emit('chatRoomDeleted', payload);
			}

			if (!notified.has(req.user.id)) {
				this.chatGateway.server
					.to(`user_${req.user.id}`)
					.emit('chatRoomDeleted', payload);
			}

			this.chatGateway.notifyChatRoomDeleted(
				result.deletedChatId,
				req.user.id,
				{ deleted: true },
			);
		}

		return {
			success: true,
			deletedBidRateId: result.deletedBidRateId,
			deletedChatId: result.deletedChatId,
		};
	}
}
