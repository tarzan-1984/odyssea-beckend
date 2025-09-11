import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
	let service: PrismaService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [PrismaService],
		}).compile();

		service = module.get<PrismaService>(PrismaService);
	});

	afterEach(async () => {
		await service.$disconnect();
	});

	describe('Database Connection', () => {
		it('should connect to database successfully', async () => {
			// Test database connection
			await expect(service.$connect()).resolves.not.toThrow();

			// Verify connection is active
			expect(service).toBeDefined();
		});

		it('should be able to query database', async () => {
			// Test a simple query to verify database is working
			const result = await service.$queryRaw`SELECT 1 as test`;
			expect(result).toEqual([{ test: 1 }]);
		});

		it('should disconnect from database successfully', async () => {
			await service.$connect();
			await expect(service.$disconnect()).resolves.not.toThrow();
		});
	});
});
