import { Test, TestingModule } from '@nestjs/testing';
import { MailerModule } from './mailer.module';
import { MailerService } from './mailer.service';

describe('MailerModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [MailerModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide MailerService', () => {
    const mailerService = module.get<MailerService>(MailerService);
    expect(mailerService).toBeDefined();
  });

  it('should export MailerService', () => {
    const mailerService = module.get<MailerService>(MailerService);
    expect(mailerService).toBeDefined();
  });

  it('should provide MailerService instance', () => {
    const mailerService = module.get<MailerService>(MailerService);
    expect(mailerService).toBeInstanceOf(MailerService);
  });

  it('should have MailerService as provider', () => {
    const mailerService = module.get<MailerService>(MailerService);
    expect(mailerService).toBeDefined();
  });
});
