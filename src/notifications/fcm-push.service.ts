import { Inject, Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import {
	ANDROID_NOTIFICATION_CHANNEL_ID,
	ANDROID_NOTIFICATION_ICON,
} from './constants/notification-channel.constants';

export interface FCMPushOptions {
	title: string;
	body: string;
	imageUrl?: string; // Avatar URL for notification icon
	data?: Record<string, string>; // Additional data for the app
}

@Injectable()
export class FcmPushService {
	private readonly logger = new Logger(FcmPushService.name);

	constructor(
		@Inject('FIREBASE_ADMIN')
		private readonly firebaseApp: admin.app.App,
	) {}

	private get messaging() {
		return this.firebaseApp.messaging();
	}

	/**
	 * Send FCM push notification to a single device token
	 */
	async sendToToken(token: string, options: FCMPushOptions): Promise<string> {
		try {
			const message: admin.messaging.Message = {
				token,
				notification: {
					title: options.title,
					body: options.body,
					imageUrl: options.imageUrl, // Large icon for Android, image for iOS
				},
				data:
					options.data && Object.keys(options.data).length > 0
						? Object.fromEntries(
								Object.entries(options.data)
									.filter(
										([_, v]) =>
											v !== undefined &&
											v !== null &&
											v !== '',
									)
									.map(([k, v]) => [k, String(v)]),
							)
						: undefined,
				android: {
					priority: 'high' as const,
					notification: {
						icon: ANDROID_NOTIFICATION_ICON, // Small icon (left side) - custom app notification icon
						imageUrl: options.imageUrl, // Large icon (right side) - user avatar, automatically rounded by Android
						channelId: ANDROID_NOTIFICATION_CHANNEL_ID, // Notification channel
						sound: 'livechat', // Custom sound from app.json
						priority: 'high' as const,
					},
				},
				apns: {
					payload: {
						aps: {
							alert: {
								title: options.title,
								body: options.body,
							},
							sound: 'livechat.wav', // Custom sound for iOS
							badge: 1,
							'content-available': 1,
							...(options.imageUrl
								? { 'mutable-content': 1 }
								: {}), // Enable mutable content for iOS image attachments
						},
					},
					// Note: imageUrl in notification field above will be used for iOS image display
					// FCM Admin SDK handles iOS image through notification.imageUrl automatically
				},
			};

			const messageId = await this.messaging.send(message);
			this.logger.log(`FCM message sent successfully: ${messageId}`);
			return messageId;
		} catch (error: any) {
			this.logger.error(
				`Failed to send FCM message to token ${token.substring(0, 20)}...: ${error.message}`,
			);
			throw error;
		}
	}

	/**
	 * Send FCM push notifications to multiple device tokens
	 * Uses batch sending for better performance
	 */
	async sendToTokens(
		tokens: string[],
		options: FCMPushOptions,
	): Promise<{ success: number; failure: number }> {
		if (tokens.length === 0) {
			return { success: 0, failure: 0 };
		}

		// FCM supports up to 500 tokens per batch
		const batchSize = 500;
		let success = 0;
		let failure = 0;

		for (let i = 0; i < tokens.length; i += batchSize) {
			const batch = tokens.slice(i, i + batchSize);

			try {
				const message: admin.messaging.MulticastMessage = {
					tokens: batch,
					notification: {
						title: options.title,
						body: options.body,
						imageUrl: options.imageUrl, // Large icon for Android, image for iOS
					},
					data:
						options.data && Object.keys(options.data).length > 0
							? Object.fromEntries(
									Object.entries(options.data)
										.filter(
											([_, v]) =>
												v !== undefined &&
												v !== null &&
												v !== '',
										)
										.map(([k, v]) => [k, String(v)]),
								)
							: undefined,
					android: {
						priority: 'high' as const,
						notification: {
							icon: ANDROID_NOTIFICATION_ICON, // Small icon (left side) - custom app notification icon
							imageUrl: options.imageUrl, // Large icon (right side) - user avatar, automatically rounded by Android
							channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
							sound: 'livechat',
							priority: 'high' as const,
						},
					},
					apns: {
						payload: {
							aps: {
								alert: {
									title: options.title,
									body: options.body,
								},
								sound: 'livechat.wav',
								badge: 1,
								'content-available': 1,
								...(options.imageUrl
									? { 'mutable-content': 1 }
									: {}), // Enable mutable content for iOS image attachments
							},
						},
						// Note: imageUrl in notification field above will be used for iOS image display
						// FCM Admin SDK handles iOS image through notification.imageUrl automatically
					},
				};

				const response =
					await this.messaging.sendEachForMulticast(message);

				success += response.successCount;
				failure += response.failureCount;

				// Log failures
				if (response.failureCount > 0) {
					response.responses.forEach((resp, idx) => {
						if (!resp.success) {
							this.logger.warn(
								`Failed to send to token ${batch[idx]?.substring(0, 20)}...: ${resp.error?.message || 'Unknown error'}`,
							);
						}
					});
				}
			} catch (error: any) {
				this.logger.error(
					`Failed to send batch FCM messages: ${error.message}`,
				);
				failure += batch.length;
			}
		}

		this.logger.log(
			`FCM batch send completed: ${success} success, ${failure} failure`,
		);

		return { success, failure };
	}
}
