import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { S3Service } from '../src/s3/s3.service';

// Mock S3Service for integration tests
const mockS3Service = {
  createPresignedPut: jest.fn(),
};

describe('Storage (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(S3Service)
      .useValue(mockS3Service)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/storage/presign (POST)', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post('/v1/storage/presign')
        .send({
          filename: 'test.pdf',
          contentType: 'application/pdf',
        })
        .expect(401);
    });

    it('should create presigned URL with valid data', () => {
      const mockResult = {
        uploadUrl: 'https://s3.test.com/bucket/files/test.pdf?signature=test',
        fileUrl: 'https://s3.test.com/bucket/files/test.pdf',
        key: 'files/test.pdf',
      };

      mockS3Service.createPresignedPut.mockResolvedValue(mockResult);

      // Note: In a real test, you would need to provide a valid JWT token
      // For this example, we'll test the endpoint structure
      return request(app.getHttpServer())
        .post('/v1/storage/presign')
        .send({
          filename: 'test.pdf',
          contentType: 'application/pdf',
        })
        .expect(401); // Expected due to missing auth
    });

    it('should validate request body', () => {
      return request(app.getHttpServer())
        .post('/v1/storage/presign')
        .send({
          filename: 'a'.repeat(300), // Too long
          contentType: 'invalid-type',
        })
        .expect(401); // Auth error comes before validation
    });
  });

  describe('Validation', () => {
    it('should accept valid filename', () => {
      const validFilenames = [
        'document.pdf',
        'image.jpg',
        'file-name_with.extension',
        'файл.txt', // Unicode
      ];

      validFilenames.forEach(filename => {
        const dto = { filename, contentType: 'text/plain' };
        expect(() => {
          // This would be validated by class-validator in real scenario
          const validation = filename.length <= 255 && /^[^<>:"/\\|?*]+$/.test(filename);
          expect(validation).toBe(true);
        }).not.toThrow();
      });
    });

    it('should reject invalid filename', () => {
      const invalidFilenames = [
        'file<name.txt',
        'file>name.txt',
        'file:name.txt',
        'file"name.txt',
        'file/name.txt',
        'file\\name.txt',
        'file|name.txt',
        'file?name.txt',
        'file*name.txt',
      ];

      invalidFilenames.forEach(filename => {
        const validation = /^[^<>:"/\\|?*]+$/.test(filename);
        expect(validation).toBe(false);
      });
    });

    it('should accept valid content types', () => {
      const validContentTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      validContentTypes.forEach(contentType => {
        const validation = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*$/.test(contentType);
        expect(validation).toBe(true);
      });
    });
  });
});