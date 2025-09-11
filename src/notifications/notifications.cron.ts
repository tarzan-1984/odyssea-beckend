import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsCron {
	private readonly logger = new Logger(NotificationsCron.name);

	constructor(private readonly notificationsService: NotificationsService) {}

	/**
	 * Send unread message notifications every 15 minutes
	 * This cron job runs every 15 minutes to check for unread messages
	 * and send email notifications to users who have them
	 */
	@Cron('0 */15 * * * *', {
		name: 'unread-messages-notifications',
		timeZone: 'UTC',
	})
	async handleUnreadMessageNotifications() {
		this.logger.log('Running unread message notifications cron job...');

		try {
			await this.notificationsService.sendUnreadMessageNotifications();
			this.logger.log(
				'Unread message notifications cron job completed successfully',
			);
		} catch (error) {
			this.logger.error(
				'Unread message notifications cron job failed:',
				error,
			);
		}
	}

  /**
   * Alternative cron job that runs every 15 minutes
   * This is a backup method in case the string-based cron doesn't work
   */
  @Cron('0 */15 * * * *', {
    name: 'unread-messages-notifications-backup',
    timeZone: 'UTC',
  })
  async handleUnreadMessageNotificationsBackup() {
    // This method is intentionally empty to avoid duplicate notifications
    // The main cron job above handles the actual work
    this.logger.debug('Backup cron job triggered (main job should handle this)');
  }

  /**
   * Clean up old notification sent records every day at 2 AM
   * This prevents the notifications_sent table from growing too large
   */
  @Cron('0 2 * * *', {
    name: 'cleanup-notification-records',
    timeZone: 'UTC',
  })
  async handleCleanupNotificationRecords() {
    this.logger.log('Running cleanup of old notification records...');

    try {
      const deletedCount = await this.notificationsService.cleanupOldNotificationRecords();
      this.logger.log(`Cleanup completed. Deleted ${deletedCount} old notification records`);
    } catch (error) {
      this.logger.error('Cleanup of notification records failed:', error);
    }
  }
}
