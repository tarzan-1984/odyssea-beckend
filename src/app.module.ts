import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailerModule } from './mailer/mailer.module';
import { ChatsModule } from './chats/chats.module';

import {
  databaseConfig,
  appConfig,
  jwtConfig,
  swaggerConfig,
  mailerConfig,
} from './config/env.config';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig, jwtConfig, swaggerConfig, mailerConfig],
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MailerModule,
    ChatsModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
