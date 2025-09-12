import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SyncController } from './sync.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersModule', () => {
	let module: TestingModule;

	const mockPrismaService = {
		user: {
			create: jest.fn(),
			findMany: jest.fn(),
			findUnique: jest.fn(),
			update: jest.fn(),
			delete: jest.fn(),
			count: jest.fn(),
		},
	};

	const mockConfigService = {
		get: jest.fn().mockReturnValue('test-api-key'),
	};

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [ConfigModule],
			controllers: [UsersController, SyncController],
			providers: [
				UsersService,
				{
					provide: PrismaService,
					useValue: mockPrismaService,
				},
				{
					provide: 'ConfigService',
					useValue: mockConfigService,
				},
			],
		}).compile();
	});

	afterEach(async () => {
		if (module) {
			await module.close();
		}
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

	it('should provide SyncController', () => {
		const syncController = module.get<SyncController>(SyncController);
		expect(syncController).toBeDefined();
	});

	it('should provide PrismaService', () => {
		const prismaService = module.get<PrismaService>(PrismaService);
		expect(prismaService).toBeDefined();
	});

	it('should have all required dependencies injected', () => {
		const usersService = module.get<UsersService>(UsersService);
		const usersController = module.get<UsersController>(UsersController);
		const syncController = module.get<SyncController>(SyncController);

		// Verify that services can be instantiated without errors
		expect(usersService).toBeDefined();
		expect(usersController).toBeDefined();
		expect(syncController).toBeDefined();
	});

	it('should export UsersService', () => {
		const usersService = module.get<UsersService>(UsersService);
		expect(usersService).toBeDefined();
	});
});
