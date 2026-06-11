export const DEFAULT_THUMBNAIL_MAX_WIDTH = 640;
export const DEFAULT_THUMBNAIL_QUALITY = 72;

const THUMBNAIL_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'webp',
	'bmp',
	'tiff',
	'heic',
	'heif',
	'gif',
]);

export function isThumbnailCandidateFileName(fileName: string): boolean {
	const ext = fileName.toLowerCase().split('.').pop();
	return Boolean(ext && THUMBNAIL_EXTENSIONS.has(ext));
}

/** S3 key for a chat image thumbnail derived from the original object key. */
export function getThumbnailObjectKey(
	originalKey: string,
	maxWidth: number = DEFAULT_THUMBNAIL_MAX_WIDTH,
	quality: number = DEFAULT_THUMBNAIL_QUALITY,
): string {
	const thumbsPrefix = 'files/thumbs/';
	if (originalKey.startsWith(thumbsPrefix)) {
		return originalKey;
	}

	const filesPrefix = 'files/';
	let baseName = originalKey;
	if (baseName.startsWith(filesPrefix)) {
		baseName = baseName.slice(filesPrefix.length);
	}

	const withoutExt = baseName.replace(/\.[^./\\]+$/, '');
	return `${thumbsPrefix}${withoutExt}_w${maxWidth}_q${quality}.jpg`;
}

/** Build a public Wasabi URL for a thumbnail from the original file URL (path-style bucket URL). */
export function buildThumbnailUrlFromFileUrl(
	fileUrl: string,
	maxWidth: number = DEFAULT_THUMBNAIL_MAX_WIDTH,
	quality: number = DEFAULT_THUMBNAIL_QUALITY,
): string | null {
	if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
		return null;
	}

	try {
		const parsed = new URL(fileUrl);
		const marker = '/files/';
		const filesIdx = parsed.pathname.indexOf(marker);
		if (filesIdx === -1) {
			return null;
		}

		const afterFiles = parsed.pathname.slice(filesIdx + marker.length);
		if (!afterFiles || afterFiles.startsWith('thumbs/')) {
			return fileUrl;
		}

		const withoutExt = afterFiles.replace(/\.[^./\\]+$/, '');
		const prefix = parsed.pathname.slice(0, filesIdx + marker.length);
		const thumbPath = `${prefix}thumbs/${withoutExt}_w${maxWidth}_q${quality}.jpg`;
		return `${parsed.origin}${thumbPath}`;
	} catch {
		return null;
	}
}
