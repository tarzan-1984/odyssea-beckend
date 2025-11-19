import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

const firebaseAdminProvider = {
	provide: 'FIREBASE_ADMIN',
	useFactory: (configService: ConfigService) => {
		// Check if Firebase is already initialized
		if (admin.apps.length > 0) {
			return admin.app();
		}

		let serviceAccount: admin.ServiceAccount;

		// Priority 1: Try to load from environment variable (for production/Render)
		const firebaseServiceAccountJson = configService.get<string>(
			'FIREBASE_SERVICE_ACCOUNT_JSON',
		);

		if (firebaseServiceAccountJson) {
			try {
				serviceAccount = JSON.parse(firebaseServiceAccountJson);
			} catch (error) {
				throw new Error(
					'Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Make sure it contains valid JSON.',
				);
			}
		} else {
			// Priority 2: Try to load from file (for local development)
			const serviceAccountPath = path.join(
				__dirname,
				'..',
				'..',
				'config',
				'firebase-service-account.json',
			);

			if (fs.existsSync(serviceAccountPath)) {
				try {
					serviceAccount = JSON.parse(
						fs.readFileSync(serviceAccountPath, 'utf8'),
					);
				} catch (error) {
					throw new Error(
						`Failed to read Firebase service account file at: ${serviceAccountPath}`,
					);
				}
			} else {
				throw new Error(
					`Firebase service account not configured. Either:
1. Set FIREBASE_SERVICE_ACCOUNT_JSON environment variable with the JSON content, OR
2. Add firebase-service-account.json to the config directory (${serviceAccountPath})`,
				);
			}
		}

		// Initialize Firebase Admin
		const app = admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
		});

		return app;
	},
	inject: [ConfigService],
};

@Global()
@Module({
	providers: [firebaseAdminProvider],
	exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
