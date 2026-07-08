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
import { canAccessBidRates } from '../common/user-role-access';
import { AuthenticatedRequest } from '../types/request.types';
import { ChatGateway } from '../chats/chat.gateway';
import { BidRatesService } from './bid-rates.service';
import { CreateBidRateDto } from './dto/create-bid-rate.dto';

@ApiTags('Bid rates')
@ApiBearerAuth()
@Controller('bid-rates')
@UseGuards(JwtAuthGuard)
export class BidRatesController {
	constructor(
		private readonly bidRatesService: BidRatesService,
		private readonly chatGateway: ChatGateway,
	) {}

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
}
