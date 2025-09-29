import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from './users.controller';
import { SyncController } from './sync.controller';
import { UsersService } from './users.service';
import { ImportDriversService } from './services/import-drivers.service';
import { ImportDriversBackgroundService } from './services/import-drivers-background.service';
import { ImportUsersService } from './services/import-users.service';
import { ImportUsersBackgroundService } from './services/import-users-background.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
	imports: [PrismaModule, ConfigModule],
	controllers: [UsersController, SyncController],
	providers: [
		UsersService, 
		ImportDriversService,
		ImportDriversBackgroundService,
		ImportUsersService,
		ImportUsersBackgroundService,
	],
	exports: [
		UsersService, 
		ImportDriversService,
		ImportDriversBackgroundService,
		ImportUsersService,
		ImportUsersBackgroundService,
	],
})
export class UsersModule {}
