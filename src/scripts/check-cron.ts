import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NotificationsCron } from '../notifications/notifications.cron';

/**
 * Check if cron jobs are working
 * This script manually triggers the cron job to test it
 */
async function checkCron() {
  console.log('🕐 Checking cron job functionality...');

  try {
    // Create the application context
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Get the cron service
    const notificationsCron = app.get(NotificationsCron);

    console.log('⏰ Manually triggering unread message notifications...');
    
    // Manually trigger the cron job
    await notificationsCron.handleUnreadMessageNotifications();
    
    console.log('✅ Cron job test completed successfully');
    
    // Close the application
    await app.close();
  } catch (error) {
    console.error('❌ Cron job test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  checkCron();
}

export { checkCron };
