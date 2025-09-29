import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from './users.controller';
import { SyncController } from './sync.controller';
import { UsersService } from './users.service';
import { ImportDriversService } from './services/import-drivers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
	imports: [PrismaModule, ConfigModule],
	controllers: [UsersController, SyncController],
	providers: [UsersService, ImportDriversService],
	exports: [UsersService, ImportDriversService],
})
export class UsersModule {}
