import * as crypto from 'crypto';

/**
 * Encrypts a given data object using AES-256-CBC algorithm.
 *
 * @param data - The object to be encrypted.
 * @returns A string containing the IV and encrypted payload in the format iv:encryptedData.
 */
export function encryption(data: object) {
	const encryptionKey = process.env.ENCRYPTION_SECRET;
	if (!encryptionKey) return;
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv(
		'aes-256-cbc',
		Buffer.from(encryptionKey, 'hex'),
		iv,
	);
	let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
	encrypted += cipher.final('hex');
	return iv.toString('hex') + ':' + encrypted;
}

/**
 * Generates a random alphanumeric password of a specified length.
 *
 * @param length - The desired length of the password (default is 8).
 * @returns A randomly generated password string.
 */
export function generateRandomPassword(length = 8): string {
	const chars =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from(
		{ length },
		() => chars[Math.floor(Math.random() * chars.length)],
	).join('');
}
