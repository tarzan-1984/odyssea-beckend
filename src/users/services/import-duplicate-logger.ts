import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'import-duplicate-emails.log');

/**
 * Appends a duplicate-email collision line to the import log file.
 * Format: externalId - existingUserId - email
 * Example: 4534534 - 3453453 - test@test.tt
 * Fire-and-forget: does not block import; errors are logged to console.
 */
export function logImportDuplicate(
	externalId: string,
	existingUserId: string,
	email: string,
): void {
	const line = `${externalId} - ${existingUserId} - ${email}\n`;
	ensureLogDir()
		.then(() => fs.promises.appendFile(LOG_FILE, line, 'utf8'))
		.catch((err) => {
			// eslint-disable-next-line no-console
			console.error('[ImportDuplicateLogger] Failed to write to log file:', err);
		});
}

function ensureLogDir(): Promise<void> {
	return fs.promises.mkdir(LOG_DIR, { recursive: true }).then(() => undefined);
}
