import { Test, TestingModule } from '@nestjs/testing';
import { SyncController } from './sync.controller';
import { UsersService } from './users.service';
import { ConfigService } from '@nestjs/config';
import {
	WebhookSyncDto,
	WebhookType,
	WebhookRole,
} from './dto/webhook-sync.dto';
import { UserRole, UserStatus } from '@prisma/client';

describe('SyncController', () => {
	let controller: SyncController;
	let usersService: UsersService;

	const mockUsersService = {
		processWebhookSync: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn().mockReturnValue('test-api-key'),
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

	describe('processWebhook', () => {
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
				user: {
					id: '1',
					externalId: '3343',
					email: 'tdev13105@gmail.com',
					firstName: 'Test',
					lastName: 'Driver 2',
					phone: '(013) 242-3423',
					location: 'NM',
					role: UserRole.DRIVER,
					status: UserStatus.ACTIVE,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};

			mockUsersService.processWebhookSync.mockResolvedValue(
				expectedResult,
			);

			const result = await controller.processWebhook(webhookData);

			expect(usersService.processWebhookSync).toHaveBeenCalledWith(
				webhookData,
			);
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
				user: {
					id: '1',
					externalId: '33',
					email: 'milchenko2k16+11111222@gmail.com',
					firstName: 'Serhii',
					lastName: 'Milchenko',
					phone: '(667) 290-9332',
					location: 'pl',
					role: UserRole.DISPATCHER_EXPEDITE,
					status: UserStatus.ACTIVE,
					deactivateAccount: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};

			mockUsersService.processWebhookSync.mockResolvedValue(
				expectedResult,
			);

			const result = await controller.processWebhook(webhookData);

			expect(usersService.processWebhookSync).toHaveBeenCalledWith(
				webhookData,
			);
			expect(result).toEqual(expectedResult);
		});

		it('should process employee update webhook with deactivate_account successfully', async () => {
			const webhookData: WebhookSyncDto = {
				type: WebhookType.UPDATE,
				role: WebhookRole.EMPLOYEE,
				timestamp: '2025-09-12 11:02:41',
				source: 'tms-statistics',
				user_data: {
					id: 27,
					user_email: 'milchenko2k16+55995@gmail.com',
					display_name: 'Serhii Milchenko',
					first_name: 'Serhii',
					last_name: 'Milchenkos',
					roles: ['dispatcher'],
					user_registered: '2025-09-11 14:15:00',
					acf_fields: {
						permission_view: [],
						initials_color: '#0d6efd',
						work_location: 'pl',
						phone_number: '(667) 290-7550',
						flt: false,
						deactivate_account: true,
					},
				},
			};

			const expectedResult = {
				action: 'updated',
				user: {
					id: '1',
					externalId: '27',
					email: 'milchenko2k16+55995@gmail.com',
					firstName: 'Serhii',
					lastName: 'Milchenkos',
					phone: '(667) 290-7550',
					location: 'pl',
					role: UserRole.DISPATCHER_EXPEDITE,
					status: UserStatus.INACTIVE,
					deactivateAccount: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};

			mockUsersService.processWebhookSync.mockResolvedValue(
				expectedResult,
			);

			const result = await controller.processWebhook(webhookData);

			expect(usersService.processWebhookSync).toHaveBeenCalledWith(
				webhookData,
			);
			expect(result).toEqual(expectedResult);
		});

		it('should process driver delete webhook successfully', async () => {
			const webhookData: WebhookSyncDto = {
				type: WebhookType.DELETE,
				role: WebhookRole.DRIVER,
				timestamp: '2025-09-12 04:27:51',
				source: 'tms-statistics',
				driver_id: '122',
			};

			const expectedResult = {
				action: 'deleted',
				externalId: '122',
				message: 'Driver deleted successfully',
			};

			mockUsersService.processWebhookSync.mockResolvedValue(
				expectedResult,
			);

			const result = await controller.processWebhook(webhookData);

			expect(usersService.processWebhookSync).toHaveBeenCalledWith(
				webhookData,
			);
			expect(result).toEqual(expectedResult);
		});
	});
});
