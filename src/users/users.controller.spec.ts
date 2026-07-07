import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../types/request.types';
import { ImportDriversService } from './services/import-drivers.service';
import { ImportDriversBackgroundService } from './services/import-drivers-background.service';
import { ImportUsersService } from './services/import-users.service';
import { ImportUsersBackgroundService } from './services/import-users-background.service';

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
				{ provide: ImportDriversService, useValue: {} },
				{ provide: ImportDriversBackgroundService, useValue: {} },
				{ provide: ImportUsersService, useValue: {} },
				{ provide: ImportUsersBackgroundService, useValue: {} },
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
				undefined,
				undefined,
				'test',
				'{"createdAt":"desc"}',
			);

			expect(usersService.findAllUsers).toHaveBeenCalledWith(
				1,
				10,
				[UserRole.ADMINISTRATOR],
				UserStatus.ACTIVE,
				'test',
				{ createdAt: 'desc' },
				undefined,
				false,
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
				undefined,
				false,
			);
			expect(result).toEqual(mockResult);
		});
	});

	describe('findUserByExternalId', () => {
		it('should return user by external id (legacy, no filters)', async () => {
			mockUsersService.findUserByExternalId.mockResolvedValue(mockUser);

			const result = await controller.findUserByExternalId('ext_123');

			expect(usersService.findUserByExternalId).toHaveBeenCalledWith(
				'ext_123',
				{},
			);
			expect(result).toEqual(mockUser);
		});

		it('should pass DRIVER role filter from query', async () => {
			mockUsersService.findUserByExternalId.mockResolvedValue(mockUser);

			await controller.findUserByExternalId('ext_123', 'DRIVER');

			expect(usersService.findUserByExternalId).toHaveBeenCalledWith(
				'ext_123',
				{ role: UserRole.DRIVER },
			);
		});

		it('should pass excludeDriver filter from query', async () => {
			mockUsersService.findUserByExternalId.mockResolvedValue(mockUser);

			await controller.findUserByExternalId(
				'ext_123',
				undefined,
				'true',
			);

			expect(usersService.findUserByExternalId).toHaveBeenCalledWith(
				'ext_123',
				{ excludeDriver: true },
			);
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
		const adminReq = {
			user: {
				id: '1',
				email: 'test@example.com',
				role: UserRole.ADMINISTRATOR,
			},
		} as AuthenticatedRequest;

		it('should update user successfully when administrator', async () => {
			const updateUserDto: UpdateUserDto = {
				firstName: 'Jane',
				lastName: 'Smith',
			};

			const updatedUser = { ...mockUser, ...updateUserDto };
			mockUsersService.updateUser.mockResolvedValue(updatedUser);

			const result = await controller.updateUser(
				'1',
				updateUserDto,
				adminReq,
			);

			expect(usersService.updateUser).toHaveBeenCalledWith(
				'1',
				updateUserDto,
			);
			expect(result).toEqual(updatedUser);
		});

		it('should allow self-update with permitted fields only', async () => {
			const driverReq = {
				user: {
					id: 'user-1',
					email: 'd@example.com',
					role: UserRole.DRIVER,
				},
			} as AuthenticatedRequest;

			const updateUserDto: UpdateUserDto = {
				profilePhoto: 'https://example.com/a.jpg',
				role: UserRole.ADMINISTRATOR,
				email: 'hacker@example.com',
			};

			const updatedUser = {
				...mockUser,
				id: 'user-1',
				role: UserRole.DRIVER,
				profilePhoto: 'https://example.com/a.jpg',
			};
			mockUsersService.updateUser.mockResolvedValue(updatedUser);

			await controller.updateUser('user-1', updateUserDto, driverReq);

			expect(usersService.updateUser).toHaveBeenCalledWith('user-1', {
				profilePhoto: 'https://example.com/a.jpg',
			});
		});

		it('should reject update of another user when not administrator', async () => {
			const driverReq = {
				user: {
					id: 'user-1',
					email: 'd@example.com',
					role: UserRole.DRIVER,
				},
			} as AuthenticatedRequest;

			await expect(
				controller.updateUser(
					'user-2',
					{ profilePhoto: 'https://example.com/x.jpg' },
					driverReq,
				),
			).rejects.toThrow(ForbiddenException);
			expect(usersService.updateUser).not.toHaveBeenCalled();
		});

		it('should reject self-update with no permitted fields', async () => {
			const driverReq = {
				user: {
					id: 'user-1',
					email: 'd@example.com',
					role: UserRole.DRIVER,
				},
			} as AuthenticatedRequest;

			await expect(
				controller.updateUser(
					'user-1',
					{ role: UserRole.ADMINISTRATOR },
					driverReq,
				),
			).rejects.toThrow(BadRequestException);
			expect(usersService.updateUser).not.toHaveBeenCalled();
		});

		it('should allow profilePhoto when administrator updates another user', async () => {
			const adminOtherReq = {
				user: {
					id: 'admin-1',
					email: 'admin@example.com',
					role: UserRole.ADMINISTRATOR,
				},
			} as AuthenticatedRequest;

			const updateUserDto: UpdateUserDto = {
				firstName: 'Bob',
				profilePhoto: 'https://example.com/other.jpg',
			};
			const updatedUser = { ...mockUser, id: 'user-2', firstName: 'Bob' };
			mockUsersService.updateUser.mockResolvedValue(updatedUser);

			await controller.updateUser('user-2', updateUserDto, adminOtherReq);

			expect(usersService.updateUser).toHaveBeenCalledWith('user-2', {
				firstName: 'Bob',
				profilePhoto: 'https://example.com/other.jpg',
			});
		});

		it('should allow administrator to update only profilePhoto of another user', async () => {
			const adminOtherReq = {
				user: {
					id: 'admin-1',
					email: 'admin@example.com',
					role: UserRole.ADMINISTRATOR,
				},
			} as AuthenticatedRequest;

			const updatedUser = { ...mockUser, profilePhoto: 'https://example.com/x.jpg' };
			mockUsersService.updateUser.mockResolvedValue(updatedUser);

			const result = await controller.updateUser(
				'user-2',
				{ profilePhoto: 'https://example.com/x.jpg' },
				adminOtherReq,
			);

			expect(usersService.updateUser).toHaveBeenCalledWith('user-2', {
				profilePhoto: 'https://example.com/x.jpg',
			});
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
