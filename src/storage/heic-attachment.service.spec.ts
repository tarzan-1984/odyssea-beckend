import { HeicAttachmentService } from './heic-attachment.service';
import { S3Service } from '../s3/s3.service';
import { ImageConversionService } from './image-conversion.service';
import { ThumbnailService } from './thumbnail.service';

describe('HeicAttachmentService', () => {
	const mockS3 = {
		parseObjectKeyFromUrl: jest.fn(),
		assertAllowedObjectUrl: jest.fn(),
		createChatObjectKey: jest.fn(),
		putImageObject: jest.fn(),
		deleteObject: jest.fn(),
	};

	const mockConversion = {
		convertHeicToJpeg: jest.fn(),
	};

	const mockThumbnail = {
		ensureThumbnail: jest.fn(),
	};

	let service: HeicAttachmentService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new HeicAttachmentService(
			mockS3 as unknown as S3Service,
			mockConversion as unknown as ImageConversionService,
			mockThumbnail as unknown as ThumbnailService,
		);
	});

	it('returns non-HEIC attachments unchanged', async () => {
		const result = await service.normalizeAttachment({
			fileUrl: 'https://s3.example.com/bucket/files/abc.jpg',
			fileName: 'photo.jpg',
			fileSize: 1000,
		});

		expect(result).toEqual({
			fileUrl: 'https://s3.example.com/bucket/files/abc.jpg',
			fileName: 'photo.jpg',
			fileSize: 1000,
		});
		expect(mockConversion.convertHeicToJpeg).not.toHaveBeenCalled();
	});

	it('converts HEIC attachments to JPEG before message persistence', async () => {
		const sourceUrl = 'https://s3.example.com/bucket/files/source.heic';
		const jpegUrl = 'https://s3.example.com/bucket/files/target.jpg';
		const jpegBuffer = Buffer.from('jpeg-data');

		mockS3.parseObjectKeyFromUrl.mockReturnValue('files/source.heic');
		mockS3.assertAllowedObjectUrl.mockReturnValue('files/source.heic');
		mockS3.createChatObjectKey.mockReturnValue('files/target.jpg');
		mockS3.putImageObject.mockResolvedValue(jpegUrl);
		mockConversion.convertHeicToJpeg.mockResolvedValue(jpegBuffer);
		mockThumbnail.ensureThumbnail.mockResolvedValue({
			thumbnailUrl: 'https://s3.example.com/bucket/files/thumbs/target_w400_q50.jpg',
			created: true,
		});

		const result = await service.normalizeAttachment({
			fileUrl: sourceUrl,
			fileName: 'IMG_6626.heic',
			fileSize: 5000,
		});

		expect(mockConversion.convertHeicToJpeg).toHaveBeenCalledWith(sourceUrl);
		expect(mockS3.putImageObject).toHaveBeenCalledWith(
			'files/target.jpg',
			jpegBuffer,
		);
		expect(mockS3.deleteObject).toHaveBeenCalledWith('files/source.heic');
		expect(mockThumbnail.ensureThumbnail).toHaveBeenCalledWith(
			jpegUrl,
			'IMG_6626.jpg',
		);
		expect(result).toEqual({
			fileUrl: jpegUrl,
			fileName: 'IMG_6626.jpg',
			fileSize: jpegBuffer.length,
		});
	});
});
