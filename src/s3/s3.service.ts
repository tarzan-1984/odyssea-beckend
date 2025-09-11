import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import { ErrorWithResponse } from '../types/request.types';

@Injectable()
export class S3Service {
	private s3: S3Client;
	private bucket = process.env.WASABI_BUCKET || 'tms-chat';
	private prefix = process.env.WASABI_PREFIX || 'files/';
	private endpoint =
		process.env.WASABI_ENDPOINT || 'https://s3.eu-central-1.wasabisys.com';
	private region = process.env.WASABI_REGION || 'eu-central-1';

	constructor() {
		// Validate required environment variables
		const requiredEnvVars = ['WASABI_ACCESS_KEY', 'WASABI_SECRET_KEY'];
		const missingVars = requiredEnvVars.filter(
			(envVar) => !process.env[envVar],
		);

		if (missingVars.length > 0) {
			throw new Error(
				`Missing required environment variables: ${missingVars.join(', ')}`,
			);
		}

		// Use path-style for Wasabi compatibility
		this.s3 = new S3Client({
			region: this.region,
			endpoint: this.endpoint,
			forcePathStyle: true,
			credentials: {
				accessKeyId: process.env.WASABI_ACCESS_KEY!,
				secretAccessKey: process.env.WASABI_SECRET_KEY!,
			},
		});
	}

	// Create safe object key like "files/<uuid>.<ext>"
	private makeObjectKey(originalName?: string) {
		const ext = (originalName?.split('.').pop() || '').toLowerCase();
		const safeExt = ext && ext.length <= 8 ? `.${ext}` : '';
		const id = crypto.randomUUID();
		return `${this.prefix}${id}${safeExt}`;
	}

	/**
	 * Create presigned PUT URL for direct browser upload.
	 * Returns URL for upload and final public-ish file URL (path-style).
	 */
	async createPresignedPut(filename?: string, contentType?: string) {
		// Validate filename length and characters
		if (filename && filename.length > 255) {
			throw new BadRequestException('Filename too long');
		}

		// Validate content type
		const allowedTypes = [
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/webp',
			'application/pdf',
			'text/plain',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		];

		if (contentType && !allowedTypes.includes(contentType)) {
			throw new BadRequestException('File type not allowed');
		}

		const Key = this.makeObjectKey(filename);
		const cmd = new PutObjectCommand({
			Bucket: this.bucket,
			Key,
			ContentType: contentType || 'application/octet-stream',
			// If you plan to make objects public via ACL, uncomment (and set bucket policy accordingly):
			// ACL: 'public-read',
		});

		try {
			// 10 minutes expiration
			const uploadUrl = await getSignedUrl(this.s3, cmd, {
				expiresIn: 600,
			});

			// Path-style URL (matches your example)
			const fileUrl = `${this.endpoint}/${this.bucket}/${Key}`;

			return { uploadUrl, fileUrl, key: Key };
		} catch (error) {
			const errorWithResponse = error as ErrorWithResponse;
			throw new BadRequestException(
				`Failed to create presigned URL: ${errorWithResponse.message}`,
			);
		}
	}
}
