import { Test, TestingModule } from '@nestjs/testing';
import {
	ConflictException,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SyncUserDto } from './dto/sync-user.dto';
import { UserRole, UserStatus } from '@prisma/client';

describe('UsersService', () => {
	let service: UsersService;
	let prismaService: PrismaService;

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

	const mockUser = {
		id: '1',
		externalId: 'ext_123',
		email: 'test@example.com',
		firstName: 'John',
		lastName: 'Doe',
		phone: '+1234567890',
		role: UserRole.ADMINISTRATOR,
		status: UserStatus.ACTIVE,
		createdAt: new Date(),
		updatedAt: new Date(),
		lastLoginAt: null,
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				UsersService,
				{
					provide: PrismaService,
					useValue: mockPrismaService,
				},
			],
		}).compile();

		service = module.get<UsersService>(UsersService);
		prismaService = module.get<PrismaService>(PrismaService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('createUser', () => {
		const createUserDto: CreateUserDto = {
			email: 'test@example.com',
			password: 'password123',
			firstName: 'John',
			lastName: 'Doe',
			phone: '+1234567890',
			role: UserRole.ADMINISTRATOR,
			externalId: 'ext_123',
		};

		it('should create a new user successfully', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue(mockUser);

			const result = await service.createUser(createUserDto);

			expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
				where: { email: createUserDto.email },
			});
			expect(mockPrismaService.user.create).toHaveBeenCalled();
			expect(result).toEqual(mockUser);
		});

		it('should throw ConflictException if user already exists', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

			await expect(service.createUser(createUserDto)).rejects.toThrow(
				ConflictException,
			);
		});
	});

	describe('findAllUsers', () => {
		it('should return paginated users', async () => {
			const mockUsers = [mockUser];
			mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
			mockPrismaService.user.count.mockResolvedValue(1);

			const result = await service.findAllUsers(1, 10);

			expect(result).toHaveProperty('users');
			expect(result).toHaveProperty('pagination');
			expect(result.users).toHaveLength(1);
		});
	});

	describe('findUserById', () => {
		it('should return user by id', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

			const result = await service.findUserById('1');

			expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
				where: { id: '1' },
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					profilePhoto: true,
					location: true,
					state: true,
					zip: true,
					city: true,
					role: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					lastLoginAt: true,
				},
			});
			expect(result).toEqual(mockUser);
		});

		it('should throw NotFoundException if user not found', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(service.findUserById('1')).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe('findUserByExternalId', () => {
		it('should return user by external id', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

			const result = await service.findUserByExternalId('ext_123');

			expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
				where: { externalId: 'ext_123' },
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					profilePhoto: true,
					location: true,
					state: true,
					zip: true,
					city: true,
					role: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					lastLoginAt: true,
				},
			});
			expect(result).toEqual(mockUser);
		});

		it('should throw NotFoundException if user not found', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(
				service.findUserByExternalId('ext_123'),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('updateUserProfile', () => {
		const updateUserDto: UpdateUserDto = {
			firstName: 'Jane',
			lastName: 'Smith',
		};

		it('should update user profile successfully', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
			mockPrismaService.user.update.mockResolvedValue({
				...mockUser,
				...updateUserDto,
			});

			const result = await service.updateUserProfile('1', updateUserDto);

			expect(mockPrismaService.user.update).toHaveBeenCalled();
			expect(result.firstName).toBe('Jane');
		});

		it('should throw NotFoundException if user not found', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(
				service.updateUserProfile('1', updateUserDto),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('syncUser', () => {
		const syncUserDto: SyncUserDto = {
			externalId: 'ext_123',
			email: 'test@example.com',
			firstName: 'John',
			lastName: 'Doe',
			phone: '+1234567890',
			role: UserRole.ADMINISTRATOR,
		};

		it('should update existing user by externalId', async () => {
			mockPrismaService.user.findUnique
				.mockResolvedValueOnce(mockUser) // First call for externalId
				.mockResolvedValueOnce(null); // Second call for email
			mockPrismaService.user.update.mockResolvedValue(mockUser);

			const result = await service.syncUser(syncUserDto);

			expect(result.action).toBe('updated');
			expect(result.user).toEqual(mockUser);
		});

		it('should create new user if not found', async () => {
			mockPrismaService.user.findUnique
				.mockResolvedValueOnce(null) // First call for externalId
				.mockResolvedValueOnce(null); // Second call for email
			mockPrismaService.user.create.mockResolvedValue(mockUser);

			const result = await service.syncUser(syncUserDto);

			expect(result.action).toBe('created');
			expect(result.user).toEqual(mockUser);
		});
	});

	describe('deleteUser', () => {
		it.skip('should delete user successfully', async () => {
			// Mock the findUnique call to return a user (user exists)
			mockPrismaService.user.findUnique.mockImplementation(() =>
				Promise.resolve(mockUser),
			);
			mockPrismaService.user.delete.mockImplementation(() =>
				Promise.resolve(mockUser),
			);

			const result = await service.deleteUser('1');

			expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
				where: { id: '1' },
			});
			expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
				where: { id: '1' },
			});
			expect(result).toEqual({ message: 'User deleted successfully' });
		});

		it.skip('should throw NotFoundException if user not found', async () => {
			// Reset mocks to ensure clean state
			jest.clearAllMocks();
			mockPrismaService.user.findUnique.mockImplementation(() =>
				Promise.resolve(null),
			);

			await expect(service.deleteUser('1')).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe('changeUserStatus', () => {
		it.skip('should change user status successfully', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
			mockPrismaService.user.update.mockResolvedValue({
				...mockUser,
				status: UserStatus.INACTIVE,
			});

			const result = await service.changeUserStatus(
				'1',
				UserStatus.INACTIVE,
			);

			expect(mockPrismaService.user.update).toHaveBeenCalledWith({
				where: { id: '1' },
				data: { status: UserStatus.INACTIVE },
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					role: true,
					status: true,
				},
			});
			expect(result.status).toBe(UserStatus.INACTIVE);
		});

		it.skip('should throw NotFoundException if user not found', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(
				service.changeUserStatus('1', UserStatus.INACTIVE),
			).rejects.toThrow(NotFoundException);
		});
	});
});
