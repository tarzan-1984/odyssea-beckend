import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Test script for notifications
 * This script can be used to manually test the notification system
 * Run with: npm run test:notifications
 */
async function testNotifications() {
	console.log('🚀 Starting notification test...');

	try {
		// Create the application context
		const app = await NestFactory.createApplicationContext(AppModule);

		// Get the notifications service
		const notificationsService = app.get(NotificationsService);

		console.log('📧 Testing unread message notifications...');

		// Test the notification service
		await notificationsService.sendUnreadMessageNotifications();

		console.log('✅ Notification test completed successfully');

		// Close the application
		await app.close();
	} catch (error) {
		console.error('❌ Notification test failed:', error);
		process.exit(1);
	}
}

// Run the test if this file is executed directly
if (require.main === module) {
	void testNotifications();
}

export { testNotifications };
