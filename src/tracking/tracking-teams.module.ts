import { Module } from '@nestjs/common';
import { TrackingTeamsController } from './tracking-teams.controller';
import { TrackingTeamsService } from './tracking-teams.service';

@Module({
	controllers: [TrackingTeamsController],
	providers: [TrackingTeamsService],
	exports: [TrackingTeamsService],
})
export class TrackingTeamsModule {}
