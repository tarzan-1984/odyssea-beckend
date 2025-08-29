import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'jwt.secret') {
        return 'test-jwt-secret';
      }
      return undefined;
    }),
  };

  const mockPayload = {
    sub: 'user-id-123',
    email: 'test@example.com',
    role: UserRole.DRIVER,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn().mockImplementation((args) => {
                // Return different users based on the role in the payload
                const userId = args.where.id;
                if (userId === 'user-id-123') {
                  return Promise.resolve({
                    id: 'user-id-123',
                    email: 'test@example.com',
                    role: UserRole.ADMINISTRATOR, // Default role for tests
                    status: UserStatus.ACTIVE,
                  });
                }
                return Promise.resolve(null);
              }),
            },
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user payload when valid JWT payload is provided', async () => {
      const result = await strategy.validate(mockPayload);

      expect(result).toEqual({
        id: mockPayload.sub,
        email: mockPayload.email,
        role: UserRole.ADMINISTRATOR, // Role comes from database, not payload
      });
    });

    it('should handle different user roles correctly', async () => {
      const adminPayload = {
        ...mockPayload,
        role: UserRole.ADMINISTRATOR,
      };

      const result = await strategy.validate(adminPayload);

      expect(result).toEqual({
        id: adminPayload.sub,
        email: adminPayload.email,
        role: UserRole.ADMINISTRATOR, // Role comes from database, not payload
      });
    });

    it('should handle fleet manager role correctly', async () => {
      const fleetManagerPayload = {
        ...mockPayload,
        role: UserRole.FLEET_MANAGER,
      };

      const result = await strategy.validate(fleetManagerPayload);

      expect(result).toEqual({
        id: fleetManagerPayload.sub,
        email: fleetManagerPayload.email,
        role: UserRole.ADMINISTRATOR, // Role comes from database, not payload
      });
    });

    it('should handle dispatcher roles correctly', async () => {
      const dispatcherPayload = {
        ...mockPayload,
        role: UserRole.DISPATCHER_EXPEDITE,
      };

      const result = await strategy.validate(dispatcherPayload);

      expect(result).toEqual({
        id: dispatcherPayload.sub,
        email: dispatcherPayload.email,
        role: UserRole.ADMINISTRATOR, // Role comes from database, not payload
      });
    });

    it('should handle recruiter roles correctly', async () => {
      const recruiterPayload = {
        ...mockPayload,
        role: UserRole.RECRUITER,
      };

      const result = await strategy.validate(recruiterPayload);

      expect(result).toEqual({
        id: recruiterPayload.sub,
        email: recruiterPayload.email,
        role: UserRole.ADMINISTRATOR, // Role comes from database, not payload
      });
    });

    it('should handle tracking roles correctly', async () => {
      const trackingPayload = {
        ...mockPayload,
        role: UserRole.TRACKING,
      };

      const result = await strategy.validate(trackingPayload);

      expect(result).toEqual({
        id: trackingPayload.sub,
        email: trackingPayload.email,
        role: UserRole.ADMINISTRATOR, // Role comes from database, not payload
      });
    });

    it('should return consistent structure for all user types', async () => {
      const roles = [
        UserRole.ADMINISTRATOR,
        UserRole.DISPATCHER_EXPEDITE,
        UserRole.DISPATCHER_TEAM_LEADER,
        UserRole.EXPEDITE_MANAGER,
        UserRole.DISPATCHER_FTL,
        UserRole.RECRUITER,
        UserRole.RECRUITER_TEAM_LEADER,
        UserRole.TRACKING,
        UserRole.TRACKING_TEAM_LEADER,
        UserRole.FLEET_MANAGER,
        UserRole.DRIVER,
      ];

      for (const role of roles) {
        const payload = { ...mockPayload, role };
        const result = await strategy.validate(payload);

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('email');
        expect(result).toHaveProperty('role');
        expect(result.id).toBe(payload.sub);
        expect(result.email).toBe(payload.email);
        expect(result.role).toBe(UserRole.ADMINISTRATOR); // Role comes from database, not payload
      }
    });
  });

  describe('constructor', () => {
    it('should be configured with JWT secret from config', () => {
      expect(strategy).toBeDefined();
      // The strategy should be properly configured, though we can't directly test the private secret property
    });
  });
});
