import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SyncController } from './sync.controller';
import { UsersService } from './users.service';
import { SyncUserDto } from './dto/sync-user.dto';
import { UserRole } from '@prisma/client';

describe('SyncController', () => {
	let controller: SyncController;
	let usersService: UsersService;

	const mockUsersService = {
		syncUser: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn().mockReturnValue('test-api-key'),
	};

	const mockSyncUserDto: SyncUserDto = {
		externalId: 'ext_123',
		email: 'test@example.com',
		firstName: 'John',
		lastName: 'Doe',
		phone: '+1234567890',
		role: UserRole.ADMINISTRATOR,
	};

	const mockSyncResult = {
		action: 'created',
		user: {
			id: '1',
			externalId: 'ext_123',
			email: 'test@example.com',
			firstName: 'John',
			lastName: 'Doe',
			phone: '+1234567890',
			role: UserRole.ADMINISTRATOR,
			status: 'ACTIVE',
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [SyncController],
			providers: [
				{
					provide: UsersService,
					useValue: mockUsersService,
				},
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile();

		controller = module.get<SyncController>(SyncController);
		usersService = module.get<UsersService>(UsersService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('syncUser', () => {
		it('should sync user data successfully', async () => {
			mockUsersService.syncUser.mockResolvedValue(mockSyncResult);

			const result = await controller.syncUser(mockSyncUserDto);

			expect(usersService.syncUser).toHaveBeenCalledWith(mockSyncUserDto);
			expect(result).toEqual(mockSyncResult);
		});

		it('should handle sync errors', async () => {
			const error = new Error('Sync failed');
			mockUsersService.syncUser.mockRejectedValue(error);

			await expect(controller.syncUser(mockSyncUserDto)).rejects.toThrow(
				'Sync failed',
			);
		});
	});
});
