export function isHeicFileName(fileName: string): boolean {
	return /\.(heic|heif)$/i.test(fileName.trim());
}

export function isHeicObjectKey(key: string): boolean {
	const ext = key.split('.').pop()?.toLowerCase() ?? '';
	return ext === 'heic' || ext === 'heif';
}

export function toJpegFilename(filename: string): string {
	const trimmed = filename.trim();
	if (/\.(heic|heif)$/i.test(trimmed)) {
		return trimmed.replace(/\.(heic|heif)$/i, '.jpg');
	}
	const base = trimmed.replace(/\.[^./\\]+$/, '') || 'image';
	return `${base}.jpg`;
}
