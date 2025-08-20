import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole, UserStatus } from '@prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: UsersService;

  const mockUsersService = {
    createUser: jest.fn(),
    findAllUsers: jest.fn(),
    findUserById: jest.fn(),
    updateUserProfile: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    changeUserStatus: jest.fn(),
  };

  const mockUser = {
    id: '1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    role: UserRole.DRIVER,
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

  const mockPaginationResult = {
    users: [mockUser],
    meta: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    },
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
      mockUsersService.createUser.mockResolvedValue(mockUser);

      const result = await controller.createUser(createUserDto);

      expect(result).toEqual(mockUser);
      expect(usersService.createUser).toHaveBeenCalledWith(createUserDto);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockUsersService.createUser.mockRejectedValue(error);

      await expect(controller.createUser(createUserDto)).rejects.toThrow(error);
    });
  });

  describe('findAllUsers', () => {
    it('should return users with default pagination', async () => {
      mockUsersService.findAllUsers.mockResolvedValue(mockPaginationResult);

      const result = await controller.findAllUsers();

      expect(result).toEqual(mockPaginationResult);
      expect(usersService.findAllUsers).toHaveBeenCalledWith(1, 10, undefined, undefined, undefined);
    });

    it('should return users with custom pagination and filters', async () => {
      mockUsersService.findAllUsers.mockResolvedValue(mockPaginationResult);

      const result = await controller.findAllUsers('2', '20', UserRole.DRIVER, UserStatus.ACTIVE, 'john');

      expect(result).toEqual(mockPaginationResult);
      expect(usersService.findAllUsers).toHaveBeenCalledWith(2, 20, UserRole.DRIVER, UserStatus.ACTIVE, 'john');
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockUsersService.findAllUsers.mockRejectedValue(error);

      await expect(controller.findAllUsers()).rejects.toThrow(error);
    });
  });

  describe('getCurrentUserProfile', () => {
    const mockRequest = {
      user: { id: '1' },
    };

    it('should return current user profile successfully', async () => {
      mockUsersService.findUserById.mockResolvedValue(mockUser);

      const result = await controller.getCurrentUserProfile(mockRequest);

      expect(result).toEqual(mockUser);
      expect(usersService.findUserById).toHaveBeenCalledWith('1');
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockUsersService.findUserById.mockRejectedValue(error);

      await expect(controller.getCurrentUserProfile(mockRequest)).rejects.toThrow(error);
    });
  });

  describe('findUserById', () => {
    it('should return user by ID successfully', async () => {
      mockUsersService.findUserById.mockResolvedValue(mockUser);

      const result = await controller.findUserById('1');

      expect(result).toEqual(mockUser);
      expect(usersService.findUserById).toHaveBeenCalledWith('1');
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockUsersService.findUserById.mockRejectedValue(error);

      await expect(controller.findUserById('1')).rejects.toThrow(error);
    });
  });

  describe('updateUserProfile', () => {
    const updateUserDto: UpdateUserDto = {
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+0987654321',
    };

    const mockRequest = {
      user: { id: '1' },
    };

    it('should update current user profile successfully', async () => {
      const updatedUser = { ...mockUser, ...updateUserDto };
      mockUsersService.updateUserProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateUserProfile(mockRequest, updateUserDto);

      expect(result).toEqual(updatedUser);
      expect(usersService.updateUserProfile).toHaveBeenCalledWith('1', updateUserDto);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockUsersService.updateUserProfile.mockRejectedValue(error);

      await expect(controller.updateUserProfile(mockRequest, updateUserDto)).rejects.toThrow(error);
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
      mockUsersService.updateUser.mockResolvedValue(updatedUser);

      const result = await controller.updateUser('1', updateUserDto);

      expect(result).toEqual(updatedUser);
      expect(usersService.updateUser).toHaveBeenCalledWith('1', updateUserDto);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockUsersService.updateUser.mockRejectedValue(error);

      await expect(controller.updateUser('1', updateUserDto)).rejects.toThrow(error);
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const expectedResponse = { message: 'User deleted successfully' };
      mockUsersService.deleteUser.mockResolvedValue(expectedResponse);

      const result = await controller.deleteUser('1');

      expect(result).toEqual(expectedResponse);
      expect(usersService.deleteUser).toHaveBeenCalledWith('1');
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockUsersService.deleteUser.mockRejectedValue(error);

      await expect(controller.deleteUser('1')).rejects.toThrow(error);
    });
  });

  describe('changeUserStatus', () => {
    it('should change user status successfully', async () => {
      const updatedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      mockUsersService.changeUserStatus.mockResolvedValue(updatedUser);

      const result = await controller.changeUserStatus('1', UserStatus.SUSPENDED);

      expect(result).toEqual(updatedUser);
      expect(usersService.changeUserStatus).toHaveBeenCalledWith('1', UserStatus.SUSPENDED);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockUsersService.changeUserStatus.mockRejectedValue(error);

      await expect(controller.changeUserStatus('1', UserStatus.SUSPENDED)).rejects.toThrow(error);
    });
  });
});
