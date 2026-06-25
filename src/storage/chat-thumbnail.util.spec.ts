import {
	buildThumbnailUrlFromFileUrl,
	getThumbnailObjectKey,
	isThumbnailCandidateFileName,
} from './chat-thumbnail.util';

describe('chat-thumbnail.util', () => {
	it('detects image file names', () => {
		expect(isThumbnailCandidateFileName('photo.heic')).toBe(true);
		expect(isThumbnailCandidateFileName('photo.dng')).toBe(true);
		expect(isThumbnailCandidateFileName('doc.pdf')).toBe(false);
	});

	it('builds thumbnail object key from original key', () => {
		expect(getThumbnailObjectKey('files/uuid.jpg')).toBe(
			'files/thumbs/uuid_w400_q50.jpg',
		);
		expect(getThumbnailObjectKey('files/uuid.heic', 400, 80)).toBe(
			'files/thumbs/uuid_w400_q80.jpg',
		);
	});

	it('builds thumbnail URL from path-style Wasabi file URL', () => {
		const fileUrl =
			'https://s3.eu-central-1.wasabisys.com/tms-chat/files/6e6e74e0.jpg';
		expect(buildThumbnailUrlFromFileUrl(fileUrl)).toBe(
			'https://s3.eu-central-1.wasabisys.com/tms-chat/files/thumbs/6e6e74e0_w400_q50.jpg',
		);
	});
});
