import { Test, TestingModule } from '@nestjs/testing';
import { StorageController } from './storage.controller';
import { S3Service } from '../s3/s3.service';
import { PresignDto } from './dto/presign.dto';

describe('StorageController', () => {
	let controller: StorageController;
	let s3Service: S3Service;

	const mockS3Service = {
		createPresignedPut: jest.fn(),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [StorageController],
			providers: [
				{
					provide: S3Service,
					useValue: mockS3Service,
				},
			],
		}).compile();

		controller = module.get<StorageController>(StorageController);
		s3Service = module.get<S3Service>(S3Service);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(controller).toBeDefined();
	});

	describe('presign', () => {
		it('should create presigned URL successfully', async () => {
			const mockResult = {
				uploadUrl:
					'https://s3.test.com/bucket/files/test.pdf?signature=test',
				fileUrl: 'https://s3.test.com/bucket/files/test.pdf',
				key: 'files/test.pdf',
			};

			mockS3Service.createPresignedPut.mockResolvedValue(mockResult);

			const dto: PresignDto = {
				filename: 'test.pdf',
				contentType: 'application/pdf',
			};

			const result = await controller.presign(dto);

			expect(result).toEqual(mockResult);
			expect(s3Service.createPresignedPut).toHaveBeenCalledWith(
				'test.pdf',
				'application/pdf',
			);
		});

		it('should create presigned URL with minimal data', async () => {
			const mockResult = {
				uploadUrl: 'https://s3.test.com/bucket/files/uuid',
				fileUrl: 'https://s3.test.com/bucket/files/uuid',
				key: 'files/uuid',
			};

			mockS3Service.createPresignedPut.mockResolvedValue(mockResult);

			const dto: PresignDto = {};

			const result = await controller.presign(dto);

			expect(result).toEqual(mockResult);
			expect(s3Service.createPresignedPut).toHaveBeenCalledWith(
				undefined,
				undefined,
			);
		});

		it('should handle S3Service errors', async () => {
			const error = new Error('S3 Error');
			mockS3Service.createPresignedPut.mockRejectedValue(error);

			const dto: PresignDto = {
				filename: 'test.pdf',
				contentType: 'application/pdf',
			};

			await expect(controller.presign(dto)).rejects.toThrow('S3 Error');
		});
	});
});
