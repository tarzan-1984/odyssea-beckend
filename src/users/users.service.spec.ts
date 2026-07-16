import { Test, TestingModule } from '@nestjs/testing';
import {
	ConflictException,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { DriverLogService } from './driver-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';
import { MailerService } from '../mailer/mailer.service';
import { TmsDriverApplicationService } from '../tms/tms-driver-application.service';
import { TmsDriverLocationBatchService } from '../tms/tms-driver-location-batch.service';
import { UpdateUserDto } from './dto/update-user.dto';
import {
	WebhookSyncDto,
	WebhookType,
	WebhookRole,
} from './dto/webhook-sync.dto';
import { UserRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { DriverReverseGeocodeService } from '../geocoding/driver-reverse-geocode.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TmsLoadDetailsService } from '../tms/tms-load-details.service';

describe('UsersService', () => {
	let service: UsersService;
	let prismaService: PrismaService;
	let notificationsWebSocketService: NotificationsWebSocketService;

	const mockPrismaService = {
		user: {
			create: jest.fn(),
			findMany: jest.fn(),
			findUnique: jest.fn(),
			findFirst: jest.fn(),
			update: jest.fn(),
			delete: jest.fn(),
			count: jest.fn(),
		},
		userDevice: {
			findMany: jest.fn(),
			deleteMany: jest.fn(),
		},
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
			providers: [
				UsersService,
				{
					provide: PrismaService,
					useValue: mockPrismaService,
				},
				{
					provide: NotificationsWebSocketService,
					useValue: {
						sendUserLocationUpdate: jest.fn(),
						sendDeviceDeactivatedLogout: jest.fn().mockResolvedValue(undefined),
						sendDriverProfileSync: jest.fn().mockResolvedValue(undefined),
						sendDriverStatusUpdate: jest.fn().mockResolvedValue(undefined),
					},
				},
				{
					provide: MailerService,
					useValue: {},
				},
				{
					provide: TmsDriverApplicationService,
					useValue: {},
				},
				{
					provide: TmsDriverLocationBatchService,
					useValue: { sendBatch: jest.fn().mockResolvedValue(undefined) },
				},
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn((key: string) => {
							if (key === 'externalApi') {
								return {
									skipTmsDriverLocationSync: false,
									tmsLocationBatchCronEnabled: true,
								};
							}
							return undefined;
						}),
					},
				},
				{
					provide: AppSettingsService,
					useValue: {
						getLocationEnvironmentAppSettings: jest.fn().mockResolvedValue({
							locationEnvironmentMode: 'live',
							locationTestDriverExternalId: '3343',
						}),
					},
				},
				{
					provide: DriverReverseGeocodeService,
					useValue: {
						reverseGeocode: jest.fn().mockResolvedValue(null),
					},
				},
				{
					provide: NotificationsService,
					useValue: {
						sendDriverStatusChangedPush: jest.fn().mockResolvedValue(undefined),
					},
				},
				{
					provide: TmsLoadDetailsService,
					useValue: {},
				},
				{
					provide: DriverLogService,
					useValue: { record: jest.fn().mockResolvedValue(undefined) },
				},
			],
		}).compile();

		service = module.get<UsersService>(UsersService);
		prismaService = module.get<PrismaService>(PrismaService);
		notificationsWebSocketService = module.get(NotificationsWebSocketService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('findAllUsers', () => {
		it('should return paginated users', async () => {
			const mockUsers = [mockUser];
			const mockCount = 1;

			mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
			mockPrismaService.user.count.mockResolvedValue(mockCount);

			const result = await service.findAllUsers(1, 10);

			expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
				where: {},
				orderBy: { createdAt: 'desc' },
				skip: 0,
				take: 10,
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					role: true,
					status: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			expect(result).toEqual({
				users: [
					{
						id: '1',
						externalId: 'ext_123',
						user: {
							name: 'John Doe',
							role: 'administrator',
						},
						email: 'test@example.com',
						phone: '+1234567890',
						status: UserStatus.ACTIVE,
						createdAt: mockUser.createdAt,
						updatedAt: mockUser.updatedAt,
					},
				],
				pagination: {
					page: 1,
					limit: 10,
					total: 1,
					pages: 1,
				},
			});
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
		it('should return user by external id (legacy, no role filter)', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

			const result = await service.findUserByExternalId('ext_123');

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { externalId: 'ext_123' },
				}),
			);
			expect(result).toEqual({
				...mockUser,
				lastActiveApp: null,
			});
		});

		it('should filter by DRIVER role when requested', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

			await service.findUserByExternalId('ext_123', {
				role: UserRole.DRIVER,
			});

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { externalId: 'ext_123', role: UserRole.DRIVER },
				}),
			);
		});

		it('should exclude DRIVER role when requested', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

			await service.findUserByExternalId('ext_123', {
				excludeDriver: true,
			});

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						externalId: 'ext_123',
						role: { not: UserRole.DRIVER },
					},
				}),
			);
		});

		it('should throw NotFoundException if user not found', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);

			await expect(
				service.findUserByExternalId('ext_123'),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('updateUser', () => {
		it('should update user successfully', async () => {
			const updateUserDto: UpdateUserDto = {
				firstName: 'Jane',
				lastName: 'Smith',
			};

			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
			mockPrismaService.user.update.mockResolvedValue({
				...mockUser,
				...updateUserDto,
			});

			const result = await service.updateUser('1', updateUserDto);

			expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
				where: { id: '1' },
			});
			expect(mockPrismaService.user.update).toHaveBeenCalledWith({
				where: { id: '1' },
				data: updateUserDto,
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
			expect(result).toEqual({ ...mockUser, ...updateUserDto });
		});

		it('should throw NotFoundException if user not found', async () => {
			const updateUserDto: UpdateUserDto = {
				firstName: 'Jane',
			};

			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(
				service.updateUser('1', updateUserDto),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('deleteUser', () => {
		it.skip('should delete user successfully', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
			mockPrismaService.user.delete.mockResolvedValue(mockUser);

			const result = await service.deleteUser('1');

			expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
				where: { id: '1' },
			});
			expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
				where: { id: '1' },
			});
			expect(result).toEqual(mockUser);
		});

		it.skip('should throw NotFoundException if user not found', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(service.deleteUser('1')).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe('changeUserStatus', () => {
		it.skip('should change user status successfully', async () => {
			const newStatus = UserStatus.INACTIVE;

			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
			mockPrismaService.user.update.mockResolvedValue({
				...mockUser,
				status: newStatus,
			});

			const result = await service.changeUserStatus('1', newStatus);

			expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
				where: { id: '1' },
			});
			expect(mockPrismaService.user.update).toHaveBeenCalledWith({
				where: { id: '1' },
				data: { status: newStatus },
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
			expect(result).toEqual({ ...mockUser, status: newStatus });
		});

		it.skip('should throw NotFoundException if user not found', async () => {
			const newStatus = UserStatus.INACTIVE;

			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(
				service.changeUserStatus('1', newStatus),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('processWebhookSync', () => {
		it('should process driver add webhook successfully', async () => {
			const webhookData: WebhookSyncDto = {
				type: WebhookType.ADD,
				role: WebhookRole.DRIVER,
				timestamp: '2025-09-12 04:31:45',
				source: 'tms-statistics',
				driver_data: {
					driver_id: '3343',
					driver_name: 'Test Driver 2',
					driver_email: 'tdev13105@gmail.com',
					driver_phone: '(013) 242-3423',
					home_location: 'NM',
					vehicle_type: 'sprinter-van',
					vin: '44444421224',
				},
			};

			const expectedResult = {
				action: 'created',
				user: mockUser,
			};

			// Mock the private method by spying on the service
			jest.spyOn(
				service as any,
				'processDriverWebhook',
			).mockResolvedValue(expectedResult);

			const result = await service.processWebhookSync(webhookData);

			expect(result).toEqual(expectedResult);
		});

		it('should process employee add webhook successfully', async () => {
			const webhookData: WebhookSyncDto = {
				type: WebhookType.ADD,
				role: WebhookRole.EMPLOYEE,
				timestamp: '2025-09-12 04:15:13',
				source: 'tms-statistics',
				user_data: {
					id: 33,
					user_email: 'milchenko2k16+11111222@gmail.com',
					display_name: 'Serhii Milchenko',
					first_name: 'Serhii',
					last_name: 'Milchenko',
					roles: ['dispatcher'],
					user_registered: '2025-09-12 08:14:45',
					acf_fields: {
						permission_view: ['Odysseia', 'Martlet', 'Endurance'],
						initials_color: '#0d6efd',
						work_location: 'pl',
						phone_number: '(667) 290-9332',
						flt: false,
					},
				},
			};

			const expectedResult = {
				action: 'created',
				user: mockUser,
			};

			// Mock the private method by spying on the service
			jest.spyOn(
				service as any,
				'processEmployeeWebhook',
			).mockResolvedValue(expectedResult);

			const result = await service.processWebhookSync(webhookData);

			expect(result).toEqual(expectedResult);
		});

		it('should throw BadRequestException for invalid role', async () => {
			const webhookData: WebhookSyncDto = {
				type: WebhookType.ADD,
				role: 'invalid' as WebhookRole,
				timestamp: '2025-09-12 04:31:45',
				source: 'tms-statistics',
			};

			await expect(
				service.processWebhookSync(webhookData),
			).rejects.toThrow(BadRequestException);
		});

		it('should force-logout devices before deleting driver on TMS delete webhook', async () => {
			const webhookData: WebhookSyncDto = {
				type: WebhookType.DELETE,
				role: WebhookRole.DRIVER,
				timestamp: '2025-09-12 04:27:51',
				source: 'tms-statistics',
				driver_id: '122',
			};

			mockPrismaService.user.findFirst.mockResolvedValue({
				id: 'user-1',
				externalId: '122',
			});
			mockPrismaService.user.findUnique.mockResolvedValue({
				externalId: '122',
			});
			mockPrismaService.userDevice.findMany.mockResolvedValue([
				{ deviceId: 'device-a' },
				{ deviceId: 'device-b' },
			]);
			mockPrismaService.userDevice.deleteMany.mockResolvedValue({ count: 2 });
			mockPrismaService.user.delete.mockResolvedValue({ id: 'user-1' });

			const result = await service.processWebhookSync(webhookData);

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
				where: { externalId: '122', role: UserRole.DRIVER },
			});
			expect(mockPrismaService.userDevice.findMany).toHaveBeenCalledWith({
				where: { userExternalId: '122' },
				select: { deviceId: true },
			});
			expect(
				notificationsWebSocketService.sendDeviceDeactivatedLogout,
			).toHaveBeenNthCalledWith(1, 'user-1', 'device-a');
			expect(
				notificationsWebSocketService.sendDeviceDeactivatedLogout,
			).toHaveBeenNthCalledWith(2, 'user-1', 'device-b');
			expect(mockPrismaService.userDevice.deleteMany).toHaveBeenCalledWith({
				where: { userExternalId: '122' },
			});
			expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
				where: { id: 'user-1' },
			});
			expect(result).toEqual({
				action: 'deleted',
				externalId: '122',
				message: 'Driver deleted successfully',
			});
		});

		it('should force-logout devices before deleting employee on TMS delete webhook', async () => {
			const webhookData: WebhookSyncDto = {
				type: WebhookType.DELETE,
				role: WebhookRole.EMPLOYEE,
				timestamp: '2025-09-12 04:27:51',
				source: 'tms-statistics',
				user_id: 33,
			};

			mockPrismaService.user.findFirst.mockResolvedValue({
				id: 'user-33',
				externalId: '33',
			});
			mockPrismaService.user.findUnique.mockResolvedValue({
				externalId: '33',
			});
			mockPrismaService.userDevice.findMany.mockResolvedValue([
				{ deviceId: 'device-x' },
			]);
			mockPrismaService.userDevice.deleteMany.mockResolvedValue({ count: 1 });
			mockPrismaService.user.delete.mockResolvedValue({ id: 'user-33' });

			const result = await service.processWebhookSync(webhookData);

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
				where: { externalId: '33', role: { not: UserRole.DRIVER } },
			});
			expect(
				notificationsWebSocketService.sendDeviceDeactivatedLogout,
			).toHaveBeenCalledWith('user-33', 'device-x');
			expect(mockPrismaService.userDevice.deleteMany).toHaveBeenCalledWith({
				where: { userExternalId: '33' },
			});
			expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
				where: { id: 'user-33' },
			});
			expect(result).toEqual({
				action: 'deleted',
				externalId: '33',
				message: 'Employee deleted successfully',
			});
		});

		it('should update driver by externalId+role when email changes', async () => {
			const webhookData: WebhookSyncDto = {
				type: WebhookType.UPDATE,
				role: WebhookRole.DRIVER,
				timestamp: '2025-09-12 04:31:45',
				source: 'tms-statistics',
				driver_data: {
					driver_id: '3343',
					driver_name: 'Test Driver 2',
					driver_email: 'new-email@gmail.com',
					driver_phone: '(013) 242-3423',
					vehicle_type: 'sprinter-van',
					vin: '44444421224',
				},
			};

			const existingDriver = {
				id: 'user-1',
				externalId: '3343',
				email: 'old-email@gmail.com',
				firstName: 'Test',
				lastName: 'Driver',
				phone: '(013) 242-3423',
				role: UserRole.DRIVER,
				status: UserStatus.ACTIVE,
				driverStatus: 'available',
				type: 'sprinter-van',
				vin: '44444421224',
				company: [],
				isAutoupdate: false,
			};

			mockPrismaService.user.findFirst.mockResolvedValue(existingDriver);
			mockPrismaService.user.findUnique.mockResolvedValue(existingDriver);
			mockPrismaService.user.update.mockResolvedValue({
				...existingDriver,
				email: 'new-email@gmail.com',
				statusDate: null,
				deactivateAccount: false,
			});

			const result = await service.processWebhookSync(webhookData);

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
				where: { externalId: '3343', role: UserRole.DRIVER },
			});
			expect(mockPrismaService.user.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'user-1' },
					data: expect.objectContaining({
						email: 'new-email@gmail.com',
						externalId: '3343',
					}),
				}),
			);
			expect(result).toEqual(
				expect.objectContaining({
					action: 'updated',
				}),
			);
		});
	});
});
