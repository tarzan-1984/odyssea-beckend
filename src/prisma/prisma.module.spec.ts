import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaModule', () => {
	let module: TestingModule;

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [PrismaModule],
		}).compile();
	});

	afterEach(async () => {
		await module.close();
	});

	it('should be defined', () => {
		expect(module).toBeDefined();
	});

	it('should provide PrismaService instance', () => {
		const prismaService = module.get<PrismaService>(PrismaService);
		expect(prismaService).toBeDefined();
		expect(typeof prismaService.onModuleInit).toBe('function');
		expect(typeof prismaService.onModuleDestroy).toBe('function');
	});
});
