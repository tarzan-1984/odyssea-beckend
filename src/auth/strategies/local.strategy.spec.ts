import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from './local.strategy';
import { AuthService } from '../auth.service';
import { UserRole, UserStatus } from '@prisma/client';

describe('LocalStrategy', () => {
	let strategy: LocalStrategy;
	let authService: AuthService;

	const mockAuthService = {
		validateUser: jest.fn(),
	};

	const mockUser = {
		id: '1',
		email: 'test@example.com',
		password: 'hashedPassword',
		firstName: 'John',
		lastName: 'Doe',
		role: UserRole.DRIVER,
		status: UserStatus.ACTIVE,
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				LocalStrategy,
				{
					provide: AuthService,
					useValue: mockAuthService,
				},
			],
		}).compile();

		strategy = module.get<LocalStrategy>(LocalStrategy);
		authService = module.get<AuthService>(AuthService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(strategy).toBeDefined();
	});

	describe('validate', () => {
		it('should return user when valid credentials are provided', async () => {
			mockAuthService.validateUser.mockResolvedValue(mockUser);

			const result = await strategy.validate(
				'test@example.com',
				'password123',
			);

			expect(result).toEqual(mockUser);
			expect(authService.validateUser).toHaveBeenCalledWith(
				'test@example.com',
				'password123',
			);
		});

		it('should throw UnauthorizedException when user validation fails', async () => {
			mockAuthService.validateUser.mockRejectedValue(
				new UnauthorizedException('Invalid credentials'),
			);

			await expect(
				strategy.validate('test@example.com', 'wrongpassword'),
			).rejects.toThrow(UnauthorizedException);

			expect(authService.validateUser).toHaveBeenCalledWith(
				'test@example.com',
				'wrongpassword',
			);
		});

		it('should handle different user roles correctly', async () => {
			const adminUser = { ...mockUser, role: UserRole.ADMINISTRATOR };
			mockAuthService.validateUser.mockResolvedValue(adminUser);

			const result = await strategy.validate(
				'admin@example.com',
				'password123',
			);

			expect(result).toEqual(adminUser);
			expect(result.role).toBe(UserRole.ADMINISTRATOR);
		});

		it('should handle fleet manager role correctly', async () => {
			const fleetManagerUser = {
				...mockUser,
     role: UserRole.ADMINISTRATOR,
			};
			mockAuthService.validateUser.mockResolvedValue(fleetManagerUser);

			const result = await strategy.validate(
				'fleet@example.com',
				'password123',
			);

			expect(result).toEqual(fleetManagerUser);
    expect(result.role).toBe(UserRole.ADMINISTRATOR);
		});

		it('should handle dispatcher roles correctly', async () => {
			const dispatcherUser = {
				...mockUser,
     role: UserRole.DISPATCHER,
			};
			mockAuthService.validateUser.mockResolvedValue(dispatcherUser);

			const result = await strategy.validate(
				'dispatch@example.com',
				'password123',
			);

			expect(result).toEqual(dispatcherUser);
    expect(result.role).toBe(UserRole.DISPATCHER);
		});

		it('should handle recruiter roles correctly', async () => {
			const recruiterUser = { ...mockUser, role: UserRole.RECRUITER };
			mockAuthService.validateUser.mockResolvedValue(recruiterUser);

			const result = await strategy.validate(
				'recruit@example.com',
				'password123',
			);

			expect(result).toEqual(recruiterUser);
			expect(result.role).toBe(UserRole.RECRUITER);
		});

		it('should handle tracking roles correctly', async () => {
			const trackingUser = { ...mockUser, role: UserRole.TRACKING };
			mockAuthService.validateUser.mockResolvedValue(trackingUser);

			const result = await strategy.validate(
				'track@example.com',
				'password123',
			);

			expect(result).toEqual(trackingUser);
			expect(result.role).toBe(UserRole.TRACKING);
		});

		it('should handle inactive user status', async () => {
			const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
			mockAuthService.validateUser.mockRejectedValue(
				new UnauthorizedException('Account is not active'),
			);

			await expect(
				strategy.validate('inactive@example.com', 'password123'),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should handle suspended user status', async () => {
			const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED };
			mockAuthService.validateUser.mockRejectedValue(
				new UnauthorizedException('Account is suspended'),
			);

			await expect(
				strategy.validate('suspended@example.com', 'password123'),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should handle pending user status', async () => {
			const pendingUser = { ...mockUser, status: UserStatus.PENDING };
			mockAuthService.validateUser.mockRejectedValue(
				new UnauthorizedException('Account is pending approval'),
			);

			await expect(
				strategy.validate('pending@example.com', 'password123'),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should handle non-existent user', async () => {
			mockAuthService.validateUser.mockRejectedValue(
				new UnauthorizedException('Invalid credentials'),
			);

			await expect(
				strategy.validate('nonexistent@example.com', 'password123'),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should handle wrong password for existing user', async () => {
			mockAuthService.validateUser.mockRejectedValue(
				new UnauthorizedException('Invalid credentials'),
			);

			await expect(
				strategy.validate('test@example.com', 'wrongpassword'),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should pass through all validation errors from AuthService', async () => {
			const customError = new Error('Custom validation error');
			mockAuthService.validateUser.mockRejectedValue(customError);

			await expect(
				strategy.validate('test@example.com', 'password123'),
			).rejects.toThrow(customError);
		});
	});
});
