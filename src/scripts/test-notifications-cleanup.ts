import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NotificationsCleanupService } from '../notifications/notifications-cleanup.service';

async function testNotificationsCleanup() {
    console.log('🚀 Starting notifications cleanup test...');
    
    try {
        // Create application context
        const app = await NestFactory.createApplicationContext(AppModule);
        
        // Get the cleanup service
        const cleanupService = app.get(NotificationsCleanupService);
        
        // Get statistics before cleanup
        console.log('📊 Getting notification statistics...');
        const statsBefore = await cleanupService.getNotificationStats();
        console.log('Statistics before cleanup:', statsBefore);
        
        // Run manual cleanup
        console.log('🧹 Running manual cleanup...');
        const result = await cleanupService.manualCleanup();
        console.log('Cleanup result:', result);
        
        // Get statistics after cleanup
        console.log('📊 Getting notification statistics after cleanup...');
        const statsAfter = await cleanupService.getNotificationStats();
        console.log('Statistics after cleanup:', statsAfter);
        
        // Calculate difference
        const deletedCount = statsBefore.olderThan7Days - statsAfter.olderThan7Days;
        console.log(`✅ Cleanup completed successfully! Deleted ${deletedCount} notifications.`);
        
        // Close application context
        await app.close();
        
    } catch (error) {
        console.error('❌ Error during notifications cleanup test:', error);
        process.exit(1);
    }
}

// Run the test
testNotificationsCleanup();
