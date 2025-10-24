import { Controller, Get, Param, Query, UseGuards, Logger, Request, Post, Body } from '@nestjs/common';
import { MessagesArchiveService } from './messages-archive.service';
import { ArchiveBackgroundService } from './services/archive-background.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';

@Controller('messages/archive')
@UseGuards(JwtAuthGuard)
export class MessagesArchiveController {
  private readonly logger = new Logger(MessagesArchiveController.name);

  constructor(
    private readonly messagesArchiveService: MessagesArchiveService,
    private readonly archiveBackgroundService: ArchiveBackgroundService,
  ) {}

  /**
   * Get available archive days for a chat room
   */
  @Get('chat-rooms/:chatRoomId/days')
  async getAvailableArchiveDays(
    @Param('chatRoomId') chatRoomId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    this.logger.log(`Getting available archive days for chat room ${chatRoomId} by user ${req.user.id}`);
    
    try {
      const days = await this.messagesArchiveService.getAvailableArchiveDays(chatRoomId);
      
      return {
        success: true,
        data: {
          chatRoomId,
          availableDays: days,
          totalArchives: days.length,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get available archive days for ${chatRoomId}:`, error);
      
      return {
        success: false,
        error: 'Failed to get available archive days',
      };
    }
  }

  /**
   * Get next available archive (most recent one)
   */
  @Get('chat-rooms/:chatRoomId/next-available')
  async getNextAvailableArchive(
    @Param('chatRoomId') chatRoomId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    this.logger.log(`Getting next available archive for chat room ${chatRoomId} by user ${req.user.id}`);
    
    try {
      const nextArchive = await this.messagesArchiveService.getNextAvailableArchive(chatRoomId);
      
      return {
        success: true,
        data: nextArchive,
      };
    } catch (error) {
      this.logger.error(`Failed to get next available archive for ${chatRoomId}:`, error);
      
      return {
        success: false,
        error: 'Failed to get next available archive',
      };
    }
  }

  /**
   * Load archived messages for a specific day
   */
  @Get('chat-rooms/:chatRoomId/:year/:month/:day')
  async loadArchivedMessages(
    @Param('chatRoomId') chatRoomId: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('day') day: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    
    this.logger.log(`Loading archived messages for chat room ${chatRoomId}, ${yearNum}-${monthNum}-${dayNum} by user ${req.user.id}`);
    
    try {
      const archiveFile = await this.messagesArchiveService.loadArchivedMessages(
        chatRoomId,
        yearNum,
        monthNum,
        dayNum,
        req.user.id, // Pass userId to filter messages by join date
      );
      
      if (!archiveFile) {
        return {
          success: false,
          error: 'Archive not found',
        };
      }
      
      return {
        success: true,
        data: {
          chatRoomId: archiveFile.chatRoomId,
          year: archiveFile.year,
          month: archiveFile.month,
          messages: archiveFile.messages,
          totalCount: archiveFile.totalCount,
          createdAt: archiveFile.createdAt,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to load archived messages for ${chatRoomId}, ${yearNum}-${monthNum}-${dayNum}:`, error);
      
      return {
        success: false,
        error: 'Failed to load archived messages',
      };
    }
  }

  /**
   * Check if archived messages exist for a specific day
   */
  @Get('chat-rooms/:chatRoomId/:year/:month/:day/exists')
  async checkArchivedMessagesExists(
    @Param('chatRoomId') chatRoomId: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('day') day: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    
    this.logger.log(`Checking archived messages existence for chat room ${chatRoomId}, ${yearNum}-${monthNum}-${dayNum} by user ${req.user.id}`);
    
    try {
      const exists = await this.messagesArchiveService.hasArchivedMessages(
        chatRoomId,
        yearNum,
        monthNum,
        dayNum,
      );
      
      return {
        success: true,
        data: {
          exists,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to check archived messages existence for ${chatRoomId}, ${yearNum}-${monthNum}-${dayNum}:`, error);
      
      return {
        success: false,
        error: 'Failed to check archived messages existence',
      };
    }
  }

  /**
   * Start background archive process (for development/testing)
   */
  @SkipAuth()
  @Post('start-background-archive')
  async startBackgroundArchive(@Body() body: { chatRoomId?: string; batchSize?: number }) {
    this.logger.log(`Manual background archive triggered (no auth)${body.chatRoomId ? ` for chat room ${body.chatRoomId}` : ' for all chat rooms'}`);
    
    try {
      const { chatRoomId, batchSize = 50 } = body;
      
      const result = await this.archiveBackgroundService.startArchive(chatRoomId, batchSize);
      
      return {
        success: true,
        message: result.message,
        data: {
          jobId: result.jobId,
          chatRoomId,
          batchSize,
          note: 'Archive process is running in background with pagination',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to start background archive process:', error);
      
      return {
        success: false,
        error: 'Failed to start background archive process',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get background archive job status
   */
  @SkipAuth()
  @Get('status/:jobId')
  async getArchiveStatus(@Param('jobId') jobId: string) {
    try {
      const status = await this.archiveBackgroundService.getArchiveStatus(jobId);
      
      return {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get archive status for job ${jobId}:`, error);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Test archive and cleanup process manually (for development/testing)
   */
  @SkipAuth()
  @Get('test-archive')
  async testArchiveProcess() {
    this.logger.log(`Manual archive and cleanup test triggered (no auth)`);
    
    try {
      // Start the NEW background archive process
      this.logger.log('Starting NEW background archive process with pagination...');
      
      const archiveResult = await this.archiveBackgroundService.startArchive(undefined, 50);
      this.logger.log(`Background archive process started with job ID: ${archiveResult.jobId}`);

      // Also start cleanup in background
      this.messagesArchiveService.cleanupOldArchives()
        .then((cleanupResult) => {
          this.logger.log(`Cleanup process completed in background. Cleaned up ${cleanupResult.deletedCount} old archives`);
        })
        .catch((error) => {
          this.logger.error('Cleanup process failed in background:', error);
        });
      
      return {
        success: true,
        message: `Archive and cleanup processes started successfully using NEW background service.`,
        data: {
          archiveJobId: archiveResult.jobId,
          status: 'Started',
          note: 'Archive uses NEW pagination system, cleanup runs separately',
          archiveStatusUrl: `/v1/messages/archive/status/${archiveResult.jobId}`,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to start archive and cleanup processes:', error);
      
      return {
        success: false,
        error: 'Failed to start archive and cleanup processes',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Clean up archives older than 1 year
   */
  @Get('cleanup-old-archives')
  async cleanupOldArchives(@Request() req: AuthenticatedRequest) {
    this.logger.log(`Manual cleanup of old archives triggered by user ${req.user.id}`);
    
    try {
      const result = await this.messagesArchiveService.cleanupOldArchives();
      
      return {
        success: true,
        message: `Cleanup completed. Deleted ${result.deletedCount} archives older than 1 year`,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Manual cleanup failed:', error);
      
      return {
        success: false,
        error: 'Cleanup process failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Trigger cron job manually (for development/testing)
   */
  @Get('trigger-cron')
  async triggerCronJob(@Request() req: AuthenticatedRequest) {
    this.logger.log(`Manual cron trigger by user ${req.user.id}`);
    
    try {
      // Import the scheduler and trigger it manually
      const { MessagesArchiveScheduler } = await import('./messages-archive.scheduler');
      const scheduler = new MessagesArchiveScheduler(this.messagesArchiveService, this.archiveBackgroundService);
      
      await scheduler.handleArchiveProcess();
      
      return {
        success: true,
        message: 'Cron job triggered successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Manual cron trigger failed:', error);
      
      return {
        success: false,
        error: 'Cron job trigger failed',
        timestamp: new Date().toISOString(),
      };
    }
  }


}
