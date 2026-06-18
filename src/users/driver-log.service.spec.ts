import { Test, TestingModule } from '@nestjs/testing';
import { getNyWallClockHoursAgo } from '../common/utils/ny-wall-clock';
import { PrismaService } from '../prisma/prisma.service';
import { DriverLogService } from './driver-log.service';

const DRIVER_LOG_RETENTION_HOURS = 12;

describe('DriverLogService', () => {
	let service: DriverLogService;
	const mockPrisma = {
		driverLog: {
			deleteMany: jest.fn(),
		},
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				DriverLogService,
				{ provide: PrismaService, useValue: mockPrisma },
			],
		}).compile();

		service = module.get(DriverLogService);
		jest.clearAllMocks();
	});

	it('purges driver_logs older than N hours using NY wall-clock cutoff', async () => {
		mockPrisma.driverLog.deleteMany.mockResolvedValue({ count: 3 });

		const deleted = await service.purgeOlderThanNyHours(
			DRIVER_LOG_RETENTION_HOURS,
		);

		expect(deleted).toBe(3);
		expect(mockPrisma.driverLog.deleteMany).toHaveBeenCalledWith({
			where: {
				createdAt: {
					lt: getNyWallClockHoursAgo(DRIVER_LOG_RETENTION_HOURS),
				},
			},
		});
	});
});
