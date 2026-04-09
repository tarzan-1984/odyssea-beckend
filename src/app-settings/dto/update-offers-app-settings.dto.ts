import { IsInt, Max, Min } from 'class-validator';

export class UpdateOffersAppSettingsDto {
	@IsInt()
	@Min(1)
	@Max(50)
	maxDriverOpenOfferParticipations: number;
}
