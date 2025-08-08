import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, PrismaService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return application info', () => {
      const result = appController.getHello();
      expect(result.success).toBe(true);
      expect(result.data?.message).toBe('Hello World!');
      expect(result.data?.version).toBe('1.0.0');
    });
  });

  describe('health', () => {
    it('should return health status', () => {
      const result = appController.getHealth();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Service is healthy');
      expect(result.data?.timestamp).toBeDefined();
    });
  });
});
