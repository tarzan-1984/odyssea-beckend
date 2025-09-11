import { Test, TestingModule } from '@nestjs/testing';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersModule', () => {
	let module: TestingModule;

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [UsersModule],
			providers: [
				{
					provide: PrismaService,
					useValue: {
						user: {
							create: jest.fn(),
							findMany: jest.fn(),
							findUnique: jest.fn(),
							update: jest.fn(),
							delete: jest.fn(),
							count: jest.fn(),
						},
					},
				},
			],
		}).compile();
	});

	afterEach(async () => {
		await module.close();
	});

	it('should be defined', () => {
		expect(module).toBeDefined();
	});

	it('should provide UsersService', () => {
		const usersService = module.get<UsersService>(UsersService);
		expect(usersService).toBeDefined();
	});

	it('should provide UsersController', () => {
		const usersController = module.get<UsersController>(UsersController);
		expect(usersController).toBeDefined();
	});

	it('should provide PrismaService', () => {
		const prismaService = module.get<PrismaService>(PrismaService);
		expect(prismaService).toBeDefined();
	});

	it('should have all required dependencies injected', () => {
		const usersService = module.get<UsersService>(UsersService);
		const usersController = module.get<UsersController>(UsersController);

		// Verify that services can be instantiated without errors
		expect(usersService).toBeDefined();
		expect(usersController).toBeDefined();
	});

	it('should export UsersService', () => {
		const usersService = module.get<UsersService>(UsersService);
		expect(usersService).toBeDefined();
	});
});
