import { Module, Global } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

const firebaseAdminProvider = {
	provide: 'FIREBASE_ADMIN',
	useFactory: () => {
		// Check if Firebase is already initialized
		if (admin.apps.length > 0) {
			return admin.app();
		}

		// Load service account from config directory
		const serviceAccountPath = path.join(
			__dirname,
			'..',
			'..',
			'config',
			'firebase-service-account.json',
		);

		// Check if file exists
		if (!fs.existsSync(serviceAccountPath)) {
			throw new Error(
				`Firebase service account file not found at: ${serviceAccountPath}. Please add firebase-service-account.json to the config directory.`,
			);
		}

		// Load service account
		let serviceAccount: admin.ServiceAccount;
		try {
			serviceAccount = JSON.parse(
				fs.readFileSync(serviceAccountPath, 'utf8'),
			);
		} catch (error) {
			throw new Error(
				`Failed to read or parse Firebase service account file at: ${serviceAccountPath}. Error: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Initialize Firebase Admin
		const app = admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
		});

		return app;
	},
};

@Global()
@Module({
	providers: [firebaseAdminProvider],
	exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
