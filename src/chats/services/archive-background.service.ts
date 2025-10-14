import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesArchiveService } from '../messages-archive.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ArchiveJobData {
  chatRoomId?: string;
  batchSize: number;
  jobId: string;
}

export interface ArchiveJobResult {
  archived: number;
  skipped: number;
  processedBatches: number;
  chatRoomsProcessed: number;
  hasMoreData: boolean;
}

interface ArchiveJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  processedBatches: number;
  totalArchived: number;
  totalSkipped: number;
  chatRoomsProcessed: number;
  currentChatRoom?: string;
  currentDay?: string;
  isComplete: boolean;
  startTime: Date;
  endTime?: Date;
  error?: string;
  tempFiles: string[]; // Track temporary files for cleanup
}

@Injectable()
export class ArchiveBackgroundService {
  private readonly logger = new Logger(ArchiveBackgroundService.name);
  private readonly BATCH_SIZE = 50; // Messages per batch
  private readonly TEMP_DIR = path.join(os.tmpdir(), 'archive-temp');
  
  // In-memory storage for jobs (in production, you might want to use database)
  private jobs = new Map<string, ArchiveJob>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesArchiveService: MessagesArchiveService,
  ) {
    // Ensure temp directory exists
    if (!fs.existsSync(this.TEMP_DIR)) {
      fs.mkdirSync(this.TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Start archive process in background
   */
  async startArchive(chatRoomId?: string, batchSize: number = 50): Promise<{ jobId: string; message: string }> {
    const jobId = `archive-${Date.now()}`;
    
    // Create job record
    this.jobs.set(jobId, {
      id: jobId,
      status: 'processing',
      progress: 0,
      processedBatches: 0,
      totalArchived: 0,
      totalSkipped: 0,
      chatRoomsProcessed: 0,
      isComplete: false,
      startTime: new Date(),
      tempFiles: [],
    });

    // Start background processing (non-blocking)
    this.processArchiveInBackground(jobId, chatRoomId, batchSize).catch(error => {
      this.logger.error(`Background archive failed for job ${jobId}:`, error);
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.endTime = new Date();
        this.cleanupTempFiles(job.tempFiles);
      }
    });

    this.logger.log(`Background archive started with ID: ${jobId}${chatRoomId ? ` for chat room ${chatRoomId}` : ' for all chat rooms'}`);

    return {
      jobId,
      message: `Background archive process started. Job ID: ${jobId}. Check status at /v1/messages/archive/status/${jobId}`,
    };
  }

  /**
   * Process archive in background
   */
  private async processArchiveInBackground(jobId: string, chatRoomId?: string, batchSize: number = 50): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - 3); // 3 months retention

      this.logger.log(`Starting archive process for messages older than ${cutoffDate.toISOString()}`);

      // Get chat rooms to process
      const whereClause = chatRoomId 
        ? { id: chatRoomId }
        : {
            messages: {
              some: {
                createdAt: {
                  lt: cutoffDate,
                },
              },
            },
          };

      const chatRooms = await this.prisma.chatRoom.findMany({
        where: whereClause,
        include: {
          _count: {
            select: {
              messages: {
                where: {
                  createdAt: {
                    lt: cutoffDate,
                  },
                },
              },
            },
          },
        },
      });

      this.logger.log(`Found ${chatRooms.length} chat rooms to process`);

      let totalArchived = 0;
      let totalSkipped = 0;
      let processedBatches = 0;
      let chatRoomsProcessed = 0;

      for (const chatRoom of chatRooms) {
        job.currentChatRoom = chatRoom.id;
        job.chatRoomsProcessed = chatRoomsProcessed;

        this.logger.log(`Processing chat room ${chatRoom.id} (${chatRoom._count.messages} old messages)`);

        const roomResult = await this.processChatRoomArchive(jobId, chatRoom.id, cutoffDate, batchSize);
        
        totalArchived += roomResult.archived;
        totalSkipped += roomResult.skipped;
        processedBatches += roomResult.processedBatches;
        chatRoomsProcessed++;

        // Update job progress
        job.processedBatches = processedBatches;
        job.totalArchived = totalArchived;
        job.totalSkipped = totalSkipped;
        job.chatRoomsProcessed = chatRoomsProcessed;
        job.progress = Math.min(100, (chatRoomsProcessed / chatRooms.length) * 100);

        this.logger.log(`Chat room ${chatRoom.id} completed: ${roomResult.archived} archived, ${roomResult.skipped} skipped`);

        // Small delay between chat rooms
        await this.delay(1000);
      }

      // Mark job as completed
      job.status = 'completed';
      job.progress = 100;
      job.isComplete = true;
      job.endTime = new Date();

      this.logger.log(`Background archive completed for job ${jobId}: ${totalArchived} messages archived, ${totalSkipped} skipped, ${chatRoomsProcessed} chat rooms processed`);

    } catch (error) {
      this.logger.error(`Background archive failed for job ${jobId}:`, error);
      job.status = 'failed';
      job.error = error.message;
      job.endTime = new Date();
      this.cleanupTempFiles(job.tempFiles);
      throw error;
    }
  }

  /**
   * Process archive for a specific chat room
   */
  private async processChatRoomArchive(jobId: string, chatRoomId: string, cutoffDate: Date, batchSize: number): Promise<{ archived: number; skipped: number; processedBatches: number }> {
    const job = this.jobs.get(jobId);
    if (!job) return { archived: 0, skipped: 0, processedBatches: 0 };

    let totalArchived = 0;
    let totalSkipped = 0;
    let processedBatches = 0;

    // Get all old messages for this chat room
    const allMessages = await this.prisma.message.findMany({
      where: {
        chatRoomId: chatRoomId,
        createdAt: {
          lt: cutoffDate,
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (allMessages.length === 0) {
      this.logger.log(`No old messages found in chat room ${chatRoomId}`);
      return { archived: 0, skipped: 0, processedBatches: 0 };
    }

    // Group messages by day
    const messagesByDay = this.groupMessagesByDay(allMessages);

    for (const [dayKey, messages] of messagesByDay) {
      const [year, month, day] = dayKey.split('-').map(Number);
      job.currentDay = `${year}-${month}-${day}`;

      this.logger.log(`Processing day ${job.currentDay} for chat room ${chatRoomId} (${messages.length} messages)`);

      // Check if archive already exists for this day
      const archiveExists = await this.messagesArchiveService.hasArchivedMessages(chatRoomId, year, month, day);
      
      if (archiveExists) {
        this.logger.log(`Archive exists for chat room ${chatRoomId}, ${year}-${month}-${day}. Skipping.`);
        totalSkipped += messages.length;
        continue;
      }

      // Process messages in batches and create archive
      const dayResult = await this.processDayArchive(jobId, chatRoomId, year, month, day, messages, batchSize);
      totalArchived += dayResult.archived;
      processedBatches += dayResult.processedBatches;

      this.logger.log(`Day ${job.currentDay} completed: ${dayResult.archived} messages archived in ${dayResult.processedBatches} batches`);
    }

    return { archived: totalArchived, skipped: totalSkipped, processedBatches };
  }

  /**
   * Process archive for a specific day with batching
   */
  private async processDayArchive(
    jobId: string, 
    chatRoomId: string, 
    year: number, 
    month: number, 
    day: number, 
    messages: any[], 
    batchSize: number
  ): Promise<{ archived: number; processedBatches: number }> {
    const job = this.jobs.get(jobId);
    if (!job) return { archived: 0, processedBatches: 0 };

    const tempFilePath = path.join(this.TEMP_DIR, `archive-${chatRoomId}-${year}-${month}-${day}.json`);
    
    // Initialize temporary archive file
    const tempArchive = {
      chatRoomId,
      year,
      month,
      messages: [] as any[],
      totalCount: 0,
      createdAt: new Date().toISOString(),
    };

    let processedBatches = 0;
    let offset = 0;

    this.logger.log(`Creating temporary archive file: ${tempFilePath}`);

    try {
      // Process messages in batches
      while (offset < messages.length) {
        const batch = messages.slice(offset, offset + batchSize);
        
        this.logger.log(`Processing batch ${processedBatches + 1}: messages ${offset + 1}-${Math.min(offset + batchSize, messages.length)} of ${messages.length}`);

        // Add batch to temporary archive
        const archiveMessages = batch.map(msg => ({
          id: msg.id,
          content: msg.content,
          senderId: msg.senderId,
          chatRoomId: msg.chatRoomId,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date(msg.createdAt).toISOString(),
          updatedAt: msg.updatedAt ? (msg.updatedAt instanceof Date ? msg.updatedAt.toISOString() : new Date(msg.updatedAt).toISOString()) : (msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date(msg.createdAt).toISOString()),
          isRead: msg.isRead,
          fileUrl: msg.fileUrl,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          sender: msg.sender,
        }));

        tempArchive.messages.push(...archiveMessages);
        tempArchive.totalCount = tempArchive.messages.length;

        // Write temporary file after each batch
        fs.writeFileSync(tempFilePath, JSON.stringify(tempArchive, null, 2));
        job.tempFiles.push(tempFilePath);

        processedBatches++;
        offset += batchSize;

        this.logger.log(`Batch ${processedBatches} completed: ${batch.length} messages added to temp file`);

        // Small delay between batches
        await this.delay(500);
      }

      this.logger.log(`All batches processed. Uploading final archive to cloud storage...`);

      // Upload completed archive to cloud storage
      await this.messagesArchiveService.uploadArchiveFromFile(tempFilePath, chatRoomId, year, month, day);

      // Delete messages from database
      const messageIds = messages.map(msg => msg.id);
      await this.prisma.message.deleteMany({
        where: {
          id: {
            in: messageIds,
          },
        },
      });

      this.logger.log(`Successfully archived ${messages.length} messages and deleted from database`);

      return { archived: messages.length, processedBatches };

    } catch (error) {
      this.logger.error(`Failed to process day archive for ${chatRoomId}, ${year}-${month}-${day}:`, error);
      
      // Clean up temporary file on error
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      
      throw error;
    }
  }

  /**
   * Group messages by year, month and day
   */
  private groupMessagesByDay(messages: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const message of messages) {
      if (!message.createdAt) {
        this.logger.warn(`Skipping message ${message.id} - no createdAt date`);
        continue;
      }

      const date = new Date(message.createdAt);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const key = `${year}-${month}-${day}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key)!.push(message);
    }

    return grouped;
  }

  /**
   * Get archive job status
   */
  async getArchiveStatus(jobId: string): Promise<{
    status: string;
    progress: number;
    processedBatches: number;
    totalArchived: number;
    totalSkipped: number;
    chatRoomsProcessed: number;
    currentChatRoom?: string;
    currentDay?: string;
    isComplete: boolean;
    error?: string;
    startTime: Date;
    endTime?: Date;
  }> {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return {
      status: job.status,
      progress: job.progress,
      processedBatches: job.processedBatches,
      totalArchived: job.totalArchived,
      totalSkipped: job.totalSkipped,
      chatRoomsProcessed: job.chatRoomsProcessed,
      currentChatRoom: job.currentChatRoom,
      currentDay: job.currentDay,
      isComplete: job.isComplete,
      error: job.error,
      startTime: job.startTime,
      endTime: job.endTime,
    };
  }

  /**
   * Clean up temporary files
   */
  private cleanupTempFiles(tempFiles: string[]): void {
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
          this.logger.log(`Cleaned up temporary file: ${tempFile}`);
        }
      } catch (error) {
        this.logger.error(`Failed to cleanup temporary file ${tempFile}:`, error);
      }
    }
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
