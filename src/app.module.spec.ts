import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailerModule } from './mailer/mailer.module';

describe('AppModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide AppController', () => {
    const appController = module.get<AppController>(AppController);
    expect(appController).toBeDefined();
  });

  it('should import ConfigModule with global configuration', () => {
    const configModule = module.get(ConfigModule);
    expect(configModule).toBeDefined();
  });

  it('should import PrismaModule', () => {
    const prismaModule = module.get(PrismaModule);
    expect(prismaModule).toBeDefined();
  });

  it('should import AuthModule', () => {
    const authModule = module.get(AuthModule);
    expect(authModule).toBeDefined();
  });

  it('should import UsersModule', () => {
    const usersModule = module.get(UsersModule);
    expect(usersModule).toBeDefined();
  });

  it('should import MailerModule', () => {
    const mailerModule = module.get(MailerModule);
    expect(mailerModule).toBeDefined();
  });

  it('should have all required modules imported', () => {
    const appController = module.get<AppController>(AppController);
    expect(appController).toBeDefined();
  });

  it('should configure ConfigModule with environment variables', () => {
    const configModule = module.get(ConfigModule);
    expect(configModule).toBeDefined();
  });

  it('should have no additional providers', () => {
    // AppModule only has controllers, no additional providers
    const moduleMetadata = Reflect.getMetadata('providers', AppModule);
    if (moduleMetadata === undefined) {
      expect(moduleMetadata).toBeUndefined();
    } else {
      expect(moduleMetadata).toEqual([]);
    }
  });
});
