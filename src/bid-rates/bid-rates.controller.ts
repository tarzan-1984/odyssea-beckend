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
import { VoteBidOfferDto } from './dto/vote-bid-offer.dto';

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
	@ApiOperation({
		summary: 'List bid rates with owner and route',
		description:
			'Returns non-archived bids whose linked chat includes the current user as a participant.',
	})
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
			req.user.id,
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
		summary: 'Join bid via +1 (or restart after timer expiry)',
		description:
			'Creates bid_rate_participants on first +1. While the 15-min timer is active, further presses are ignored. After expiry, resets created_at/updated_at and starts a new extendable cycle.',
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
			'Adds 15 minutes to updated_at (unix seconds). Allowed up to 3 times for the creator only.',
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
			'Any linked BID chat participant. Non-owner: writes to their bid_rate_participants.rate + created_rate_at. Owner: bid_rates.rate when no active +1 timers; otherwise bid_rate_participants.rate for the owner row.',
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

	@Get(':id/rate-voters')
	@ApiOperation({
		summary: 'List recent rate offers for a bid',
		description:
			'Active offers (rate + created_rate_at within 4 min). Visible to all; canVote marks who may accept/reject.',
	})
	@ApiResponse({ status: 200, description: 'Rate offers list' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async listRateVotersByBid(
		@Param('id', ParseIntPipe) id: number,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.listRateVotersByBidId(id, req.user.id);
	}

	@Post(':id/offers/:offererUserId/vote')
	@ApiOperation({
		summary: 'Vote on a participant rate offer',
		description:
			'Accept (true) or reject (false) an offer. Voter must be in the offer snapshot with the same active +1 cycle.',
	})
	@ApiResponse({ status: 200, description: 'Vote recorded' })
	@ApiResponse({ status: 400, description: 'Bad request' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async voteOnOffer(
		@Param('id', ParseIntPipe) id: number,
		@Param('offererUserId') offererUserId: string,
		@Body() dto: VoteBidOfferDto,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.voteOnOffer(
			id,
			offererUserId,
			req.user.id,
			dto,
		);
	}

	@Post(':id/offers/:offererUserId/auto-accept-expired')
	@ApiOperation({
		summary: 'Auto-accept an expired rate offer',
		description:
			'Called by clients when the 4-min offer timer hits 0. If the offer was not Rejected (manual or auto when another offer won), applies rate only if not higher than current bid_rates.rate, then clears offer columns.',
	})
	@ApiResponse({ status: 200, description: 'Offer resolved' })
	@ApiResponse({ status: 400, description: 'Timer not expired' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Not found' })
	async autoAcceptExpiredOffer(
		@Param('id', ParseIntPipe) id: number,
		@Param('offererUserId') offererUserId: string,
		@Request() req: AuthenticatedRequest,
	) {
		if (!canAccessBidRates(req.user.role)) {
			throw new ForbiddenException('You do not have access to bid rates');
		}

		return this.bidRatesService.autoAcceptExpiredOffer(
			id,
			offererUserId,
			req.user.id,
		);
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
