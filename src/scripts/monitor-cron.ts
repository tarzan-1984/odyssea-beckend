import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorWithResponse } from '../types/request.types';

/**
 * Monitor cron job execution
 * This script will run the notification service every 30 seconds for monitoring
 */
async function monitorCron() {
	console.log('🔍 Starting cron job monitoring...');
	console.log('⏰ Will check for unread messages every 30 seconds...');
	console.log('Press Ctrl+C to stop monitoring\n');

	try {
		// Create the application context
		const app = await NestFactory.createApplicationContext(AppModule);

		// Get the notifications service
		const notificationsService = app.get(NotificationsService);

		let checkCount = 0;

		// Run every 30 seconds
		const interval = setInterval(() => {
			void (async () => {
				checkCount++;
				const timestamp = new Date().toLocaleTimeString();

				console.log(
					`\n[${timestamp}] 🔍 Check #${checkCount} - Running notification check...`,
				);

				try {
					await notificationsService.sendUnreadMessageNotifications();
					console.log(
						`[${timestamp}] ✅ Check #${checkCount} completed successfully`,
					);
				} catch (error) {
					const errorWithResponse = error as ErrorWithResponse;
					console.error(
						`[${timestamp}] ❌ Check #${checkCount} failed:`,
						errorWithResponse.message,
					);
				}
			})();
		}, 30000); // 30 seconds

		// Handle graceful shutdown
		process.on('SIGINT', () => {
			console.log('\n\n🛑 Stopping monitoring...');
			clearInterval(interval);
			void app.close().then(() => {
				console.log('✅ Monitoring stopped successfully');
				process.exit(0);
			});
		});

		// Keep the process running
		await new Promise(() => {});
	} catch (error) {
		console.error('❌ Monitoring failed:', error);
		process.exit(1);
	}
}

// Run the monitor if this file is executed directly
if (require.main === module) {
	void monitorCron();
}

export { monitorCron };
