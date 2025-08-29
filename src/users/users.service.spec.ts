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
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    role: UserRole.ADMINISTRATOR,
    status: UserStatus.ACTIVE,
    language: ['en'],
    vehicleType: 'CARGO_VAN',
    hasPalletJack: false,
    hasLiftGate: true,
    hasCDL: true,
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
      role: UserRole.DRIVER,
      language: ['en'],
      vehicleType: 'CARGO_VAN',
      hasPalletJack: false,
      hasLiftGate: true,
      hasCDL: true,
    };

    it('should create a new user successfully', async () => {
      // Mock bcrypt.hash to return a predictable hash
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedPassword' as never);

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.createUser(createUserDto);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
      });
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          ...createUserDto,
          password: 'hashedPassword',
        },
        select: expect.any(Object),
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 12);
    });

    it('should throw ConflictException if user already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.createUser(createUserDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllUsers', () => {
    const mockUsers = [mockUser];
    const mockPaginationResult = {
      users: [
        {
          id: '1',
          user: {
            image: '',
            name: 'John Doe',
            role: 'administrator',
          },
          email: 'test@example.com',
          location: '',
          phone: '+1234567890',
          vin: '',
          vehicle: {
            brand: '',
            model: '',
            year: '',
          },
        },
      ],
      pagination: {
        page: 1,
        limit: 10,
        total: 1,
        pages: 1,
      },
    };

    it('should return users with pagination and no filters', async () => {
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await service.findAllUsers(1, 10);

      expect(result).toEqual(mockPaginationResult);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {},
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should apply role filter correctly', async () => {
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockPrismaService.user.count.mockResolvedValue(1);

      await service.findAllUsers(1, 10, UserRole.DRIVER);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: { role: UserRole.DRIVER },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should apply status filter correctly', async () => {
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockPrismaService.user.count.mockResolvedValue(1);

      await service.findAllUsers(1, 10, undefined, UserStatus.ACTIVE);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: { status: UserStatus.ACTIVE },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should apply search filter correctly', async () => {
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockPrismaService.user.count.mockResolvedValue(1);

      await service.findAllUsers(1, 10, undefined, undefined, 'john');

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {
          OR: [
            { lastName: { contains: 'john', mode: 'insensitive' } },
            { email: { contains: 'john', mode: 'insensitive' } },
          ],
        },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should calculate pagination correctly', async () => {
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockPrismaService.user.count.mockResolvedValue(25);

      const result = await service.findAllUsers(3, 10);

      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 25,
        pages: 3,
      });
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        skip: 20,
        take: 10,
        where: {},
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findUserById', () => {
    it('should return user by ID successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findUserById('1');

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findUserById('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUserProfile', () => {
    const updateUserDto: UpdateUserDto = {
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+0987654321',
    };

    it('should update user profile successfully', async () => {
      const updatedUser = { ...mockUser, ...updateUserDto };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserProfile('1', updateUserDto);

      expect(result).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: updateUserDto,
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.update.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(
        service.updateUserProfile('999', updateUserDto),
      ).rejects.toThrow();
    });
  });

  describe('updateUser', () => {
    const updateUserDto: UpdateUserDto = {
      firstName: 'Jane',
      lastName: 'Smith',
      role: UserRole.FLEET_MANAGER,
    };

    it('should update user successfully', async () => {
      const updatedUser = { ...mockUser, ...updateUserDto };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUser('1', updateUserDto);

      expect(result).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: updateUserDto,
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.update.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(service.updateUser('999', updateUserDto)).rejects.toThrow();
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      const result = await service.deleteUser('1');

      expect(result).toEqual({ message: 'User deleted successfully' });
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.delete.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(service.deleteUser('999')).rejects.toThrow();
    });
  });

  describe('changeUserStatus', () => {
    it('should change user status successfully', async () => {
      const updatedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.changeUserStatus('1', UserStatus.SUSPENDED);

      expect(result).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { status: UserStatus.SUSPENDED },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.update.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(
        service.changeUserStatus('999', UserStatus.SUSPENDED),
      ).rejects.toThrow();
    });
  });
});
