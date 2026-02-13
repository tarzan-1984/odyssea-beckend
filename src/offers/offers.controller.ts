import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';

@ApiTags('Offers')
@ApiBearerAuth()
@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
	constructor(private readonly offersService: OffersService) {}

	@Post()
	@ApiOperation({
		summary: 'Create an offer',
		description:
			'Creates a new offer and rate_offers entries for each selected driver. Times stored in America/New_York.',
	})
	@ApiBody({ type: CreateOfferDto })
	@ApiResponse({
		status: 201,
		description: 'Offer created successfully',
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - validation failed',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized',
	})
	async create(@Body() dto: CreateOfferDto) {
		return this.offersService.create(dto);
	}
}
