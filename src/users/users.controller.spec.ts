import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole, UserStatus } from '@prisma/client';

describe('UsersController', () => {
	let controller: UsersController;
	let usersService: UsersService;

	const mockUsersService = {
		findAllUsers: jest.fn(),
		findUserById: jest.fn(),
		findUserByExternalId: jest.fn(),
		updateUser: jest.fn(),
		deleteUser: jest.fn(),
		changeUserStatus: jest.fn(),
	};

	const mockUser = {
		id: '1',
		externalId: 'ext_123',
		email: 'test@example.com',
		firstName: 'John',
		lastName: 'Doe',
		phone: '+1234567890',
		profilePhoto: null,
		location: 'New York',
		state: 'NY',
		zip: '10001',
		city: 'New York',
		role: UserRole.ADMINISTRATOR,
		status: UserStatus.ACTIVE,
		createdAt: new Date(),
		updatedAt: new Date(),
		lastLoginAt: null,
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [UsersController],
			providers: [
				{
					provide: UsersService,
					useValue: mockUsersService,
				},
			],
		}).compile();

		controller = module.get<UsersController>(UsersController);
		usersService = module.get<UsersService>(UsersService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('findAllUsers', () => {
		it('should return paginated users', async () => {
			const mockResult = {
				users: [mockUser],
				pagination: {
					page: 1,
					limit: 10,
					total: 1,
					totalPages: 1,
				},
			};

			mockUsersService.findAllUsers.mockResolvedValue(mockResult);

			const result = await controller.findAllUsers(
				'1',
				'10',
				UserRole.ADMINISTRATOR,
				UserStatus.ACTIVE,
				'test',
				'{"createdAt":"desc"}',
			);

			expect(usersService.findAllUsers).toHaveBeenCalledWith(
				1,
				10,
				UserRole.ADMINISTRATOR,
				UserStatus.ACTIVE,
				'test',
				{ createdAt: 'desc' },
			);
			expect(result).toEqual(mockResult);
		});

		it('should handle invalid sort parameter', async () => {
			const mockResult = {
				users: [mockUser],
				pagination: {
					page: 1,
					limit: 10,
					total: 1,
					totalPages: 1,
				},
			};

			mockUsersService.findAllUsers.mockResolvedValue(mockResult);

			const result = await controller.findAllUsers(
				'1',
				'10',
				undefined,
				undefined,
				undefined,
				'invalid-json',
			);

			expect(usersService.findAllUsers).toHaveBeenCalledWith(
				1,
				10,
				undefined,
				undefined,
				undefined,
				{ createdAt: 'desc' },
			);
			expect(result).toEqual(mockResult);
		});
	});

	describe('findUserByExternalId', () => {
		it('should return user by external id', async () => {
			mockUsersService.findUserByExternalId.mockResolvedValue(mockUser);

			const result = await controller.findUserByExternalId('ext_123');

			expect(usersService.findUserByExternalId).toHaveBeenCalledWith(
				'ext_123',
			);
			expect(result).toEqual(mockUser);
		});
	});

	describe('findUserById', () => {
		it('should return user by id', async () => {
			mockUsersService.findUserById.mockResolvedValue(mockUser);

			const result = await controller.findUserById('1');

			expect(usersService.findUserById).toHaveBeenCalledWith('1');
			expect(result).toEqual(mockUser);
		});
	});

	describe('updateUser', () => {
		it('should update user successfully', async () => {
			const updateUserDto: UpdateUserDto = {
				firstName: 'Jane',
				lastName: 'Smith',
			};

			const updatedUser = { ...mockUser, ...updateUserDto };
			mockUsersService.updateUser.mockResolvedValue(updatedUser);

			const result = await controller.updateUser('1', updateUserDto);

			expect(usersService.updateUser).toHaveBeenCalledWith(
				'1',
				updateUserDto,
			);
			expect(result).toEqual(updatedUser);
		});
	});

	describe('deleteUser', () => {
		it('should delete user successfully', async () => {
			mockUsersService.deleteUser.mockResolvedValue(mockUser);

			const result = await controller.deleteUser('1');

			expect(usersService.deleteUser).toHaveBeenCalledWith('1');
			expect(result).toEqual(mockUser);
		});
	});

	describe('changeUserStatus', () => {
		it('should change user status successfully', async () => {
			const newStatus = UserStatus.INACTIVE;
			const updatedUser = { ...mockUser, status: newStatus };

			mockUsersService.changeUserStatus.mockResolvedValue(updatedUser);

			const result = await controller.changeUserStatus('1', newStatus);

			expect(usersService.changeUserStatus).toHaveBeenCalledWith(
				'1',
				newStatus,
			);
			expect(result).toEqual(updatedUser);
		});
	});
});
