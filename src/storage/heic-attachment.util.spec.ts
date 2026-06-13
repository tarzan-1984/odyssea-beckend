import {
	isHeicFileName,
	isHeicObjectKey,
	toJpegFilename,
} from './heic-attachment.util';

describe('heic-attachment.util', () => {
	it('detects HEIC filenames', () => {
		expect(isHeicFileName('IMG_6626.heic')).toBe(true);
		expect(isHeicFileName('photo.HEIF')).toBe(true);
		expect(isHeicFileName('photo.jpg')).toBe(false);
	});

	it('detects HEIC object keys', () => {
		expect(isHeicObjectKey('files/uuid.heic')).toBe(true);
		expect(isHeicObjectKey('files/uuid.jpg')).toBe(false);
	});

	it('rewrites HEIC filenames to JPEG', () => {
		expect(toJpegFilename('IMG_6626.heic')).toBe('IMG_6626.jpg');
		expect(toJpegFilename('photo.heif')).toBe('photo.jpg');
	});
});
