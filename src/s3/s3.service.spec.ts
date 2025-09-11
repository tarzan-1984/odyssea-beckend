import { Test, TestingModule } from '@nestjs/testing';
import { S3Service } from './s3.service';
import { BadRequestException } from '@nestjs/common';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
	S3Client: jest.fn().mockImplementation(() => ({
		send: jest.fn(),
	})),
	PutObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
	getSignedUrl: jest.fn(),
}));

describe('S3Service', () => {
	let service: S3Service;

	beforeEach(async () => {
		// Set up environment variables
		process.env.WASABI_ACCESS_KEY = 'test-access-key';
		process.env.WASABI_SECRET_KEY = 'test-secret-key';
		process.env.WASABI_BUCKET = 'test-bucket';
		process.env.WASABI_ENDPOINT = 'https://s3.test.com';
		process.env.WASABI_REGION = 'us-east-1';
		process.env.WASABI_PREFIX = 'files/';

		const module: TestingModule = await Test.createTestingModule({
			providers: [S3Service],
		}).compile();

		service = module.get<S3Service>(S3Service);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('createPresignedPut', () => {
		const mockSignedUrl =
			'https://s3.test.com/test-bucket/files/test-file.pdf?signature=test';
		const mockFileUrl =
			'https://s3.test.com/test-bucket/files/test-file.pdf';
		const mockKey = 'files/test-file.pdf';

		beforeEach(() => {
			const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
			getSignedUrl.mockResolvedValue(mockSignedUrl);
		});

		it('should create presigned URL successfully', async () => {
			const result = await service.createPresignedPut(
				'test-file.pdf',
				'application/pdf',
			);

			expect(result).toEqual({
				uploadUrl: mockSignedUrl,
				fileUrl: expect.stringMatching(
					/^https:\/\/s3\.test\.com\/test-bucket\/files\/[a-f0-9-]+\.pdf$/,
				),
				key: expect.stringMatching(/^files\/[a-f0-9-]+\.pdf$/),
			});
		});

		it('should create presigned URL without filename', async () => {
			const result = await service.createPresignedPut();

			expect(result).toEqual({
				uploadUrl: mockSignedUrl,
				fileUrl: expect.stringMatching(
					/^https:\/\/s3\.test\.com\/test-bucket\/files\/[a-f0-9-]+$/,
				),
				key: expect.stringMatching(/^files\/[a-f0-9-]+$/),
			});
		});

		it('should throw error for filename too long', async () => {
			const longFilename = 'a'.repeat(256);

			await expect(
				service.createPresignedPut(longFilename, 'application/pdf'),
			).rejects.toThrow(BadRequestException);
		});

		it('should throw error for invalid content type', async () => {
			await expect(
				service.createPresignedPut(
					'test.exe',
					'application/x-executable',
				),
			).rejects.toThrow(BadRequestException);
		});

		it('should allow valid content types', async () => {
			const validTypes = [
				'image/jpeg',
				'image/png',
				'image/gif',
				'image/webp',
				'application/pdf',
				'text/plain',
				'application/msword',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			];

			for (const contentType of validTypes) {
				await expect(
					service.createPresignedPut('test.file', contentType),
				).resolves.toBeDefined();
			}
		});

		it('should handle AWS SDK errors', async () => {
			const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
			getSignedUrl.mockRejectedValue(new Error('AWS Error'));

			await expect(
				service.createPresignedPut('test.pdf', 'application/pdf'),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe('constructor', () => {
		it('should throw error when required environment variables are missing', () => {
			delete process.env.WASABI_ACCESS_KEY;
			delete process.env.WASABI_SECRET_KEY;

			expect(() => new S3Service()).toThrow(
				'Missing required environment variables',
			);
		});
	});
});
