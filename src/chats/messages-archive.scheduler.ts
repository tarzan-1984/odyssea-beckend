import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessagesArchiveService } from './messages-archive.service';
import { ArchiveBackgroundService } from './services/archive-background.service';

@Injectable()
export class MessagesArchiveScheduler {
  private readonly logger = new Logger(MessagesArchiveScheduler.name);

  constructor(
    private readonly messagesArchiveService: MessagesArchiveService,
    private readonly archiveBackgroundService: ArchiveBackgroundService,
  ) {}

  /**
   * Archive old messages every day at 2:00 AM using background service
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleArchiveProcess() {
    this.logger.log('Starting daily archive process with background service...');
    
    try {
      // Start background archive process (non-blocking)
      const result = await this.archiveBackgroundService.startArchive(undefined, 50);
      this.logger.log(`Background archive process started with job ID: ${result.jobId}`);
      
      // Don't await - let it run in background
      // The process will log its progress and completion status
      
    } catch (error) {
      this.logger.error('Failed to start daily archive process:', error);
    }
  }

  /**
   * Cleanup old archives every day at 3:00 AM (1 hour after archive)
   */
  @Cron('0 3 * * *') // Every day at 3:00 AM
  async handleCleanupProcess() {
    this.logger.log('Starting daily cleanup process...');
    
    try {
      // Step 1: Cleanup old archives (older than 1 year)
      const cleanupResult = await this.messagesArchiveService.cleanupOldArchives();
      this.logger.log(`Cleanup completed: Cleaned up ${cleanupResult.deletedCount} old archives`);
      
      this.logger.log('Daily cleanup process completed successfully');
    } catch (error) {
      this.logger.error('Daily cleanup process failed:', error);
    }
  }

  /**
   * Backup archive and cleanup process every Sunday at 3:00 AM
   */
  @Cron('0 3 * * 0') // Every Sunday at 3:00 AM
  async handleWeeklyArchiveAndCleanupProcess() {
    this.logger.log('Starting weekly archive and cleanup process (backup)...');
    
    try {
      // Step 1: Archive old messages (older than 3 months)
      this.logger.log('Step 1: Archiving old messages (backup)...');
      await this.messagesArchiveService.archiveOldMessages();
      this.logger.log('Step 1 completed: Old messages archived successfully (backup)');
      
      // Step 2: Cleanup old archives (older than 1 year)
      this.logger.log('Step 2: Cleaning up old archives (backup)...');
      const cleanupResult = await this.messagesArchiveService.cleanupOldArchives();
      this.logger.log(`Step 2 completed: Cleaned up ${cleanupResult.deletedCount} old archives (backup)`);
      
      this.logger.log('Weekly archive and cleanup process completed successfully (backup)');
    } catch (error) {
      this.logger.error('Weekly archive and cleanup process failed (backup):', error);
    }
  }
}
