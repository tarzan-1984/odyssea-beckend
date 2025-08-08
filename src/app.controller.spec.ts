import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return application status', () => {
      const result = appController.getStatus();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Odyssea Backend is running');
      expect(result.data?.timestamp).toBeDefined();
    });
  });
});
