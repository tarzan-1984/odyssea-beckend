import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../s3/s3.service';

export interface ArchiveMessage {
  id: string;
  content: string;
  senderId: string;
  chatRoomId: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface ArchiveFile {
  chatRoomId: string;
  year: number;
  month: number;
  messages: ArchiveMessage[];
  totalCount: number;
  createdAt: string;
  updatedAt?: string;
}

@Injectable()
export class MessagesArchiveService {
  private readonly logger = new Logger(MessagesArchiveService.name);
  private readonly archiveRetentionMonths: number;
  
  // Performance thresholds
  private readonly LARGE_ARCHIVE_THRESHOLD = 50000; // messages
  private readonly EFFICIENT_SORT_THRESHOLD = 10000; // messages

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
  ) {
    this.archiveRetentionMonths = this.configService.get('ARCHIVE_RETENTION_MONTHS', 3);
  }

  /**
   * Get user's join date for a specific chat room
   */
  private async getUserJoinDate(chatRoomId: string, userId: string): Promise<Date | null> {
    try {
      const participant = await this.prisma.chatRoomParticipant.findUnique({
        where: {
          chatRoomId_userId: {
            chatRoomId,
            userId,
          },
        },
        select: {
          joinedAt: true,
        },
      });

      return participant?.joinedAt || null;
    } catch (error) {
      this.logger.error(`Failed to get user join date for ${userId} in chat room ${chatRoomId}:`, error);
      return null;
    }
  }

  /**
   * Filter messages by user's join date
   */
  private filterMessagesByJoinDate(messages: ArchiveMessage[], joinDate: Date): ArchiveMessage[] {
    if (!joinDate) {
      return messages; // If no join date, return all messages
    }

    return messages.filter(message => {
      const messageDate = new Date(message.createdAt);
      return messageDate >= joinDate;
    });
  }
  private getArchiveFilePath(chatRoomId: string, year: number, month: number, day?: number): string {
    const monthStr = month.toString().padStart(2, '0');
    
    if (day !== undefined) {
      // Daily archive: archive/chat-rooms/{chatRoomId}/{year}/{month}/{day}.json
      const dayStr = day.toString().padStart(2, '0');
      return `archive/chat-rooms/${chatRoomId}/${year}/${monthStr}/${dayStr}.json`;
    } else {
      // Monthly archive (legacy): archive/chat-rooms/{chatRoomId}/{year}/{month}.json
      return `archive/chat-rooms/${chatRoomId}/${year}/${monthStr}.json`;
    }
  }

  /**
   * Upload messages to cloud storage using S3Service directly
   */
  private async uploadToCloudStorage(filePath: string, data: ArchiveFile): Promise<string> {
    try {
      // Convert data to JSON buffer
      const jsonData = JSON.stringify(data, null, 2);
      const buffer = Buffer.from(jsonData, 'utf-8');
      
      // Use S3Service's uploadArchive method
      const fileUrl = await this.s3Service.uploadArchive(filePath, buffer);
      
      this.logger.log(`Successfully uploaded archive to: ${fileUrl}`);
      return fileUrl;
    } catch (error) {
      this.logger.error(`Failed to upload archive to cloud storage: ${error}`);
      throw error;
    }
  }

  /**
   * Upload archive from temporary file to cloud storage
   */
  async uploadArchiveFromFile(tempFilePath: string, chatRoomId: string, year: number, month: number, day: number): Promise<string> {
    try {
      const fs = require('fs');
      
      // Read the temporary file
      const fileContent = fs.readFileSync(tempFilePath, 'utf-8');
      const archiveData: ArchiveFile = JSON.parse(fileContent);
      
      // Get the cloud storage file path
      const cloudFilePath = this.getArchiveFilePath(chatRoomId, year, month, day);
      
      // Convert to buffer and upload
      const buffer = Buffer.from(fileContent, 'utf-8');
      const fileUrl = await this.s3Service.uploadArchive(cloudFilePath, buffer);
      
      this.logger.log(`Successfully uploaded archive from temp file to: ${fileUrl}`);
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      this.logger.log(`Cleaned up temporary file: ${tempFilePath}`);
      
      return fileUrl;
    } catch (error) {
      this.logger.error(`Failed to upload archive from temp file: ${error}`);
      throw error;
    }
  }

  /**
   * Download messages from cloud storage using S3Service
   */
  private async downloadFromCloudStorage(filePath: string): Promise<ArchiveFile | null> {
    try {
      // For S3, we need to construct the full URL and fetch it
      const bucket = process.env.WASABI_BUCKET || 'tms-chat';
      const endpoint = process.env.WASABI_ENDPOINT || 'https://s3.eu-central-1.wasabisys.com';
      const fullUrl = `${endpoint}/${bucket}/${filePath}`;
      
      this.logger.log(`Downloading archive from: ${fullUrl}`);
      
      // Fetch the file from S3
      const response = await fetch(fullUrl);
      
      if (!response.ok) {
        if (response.status === 404) {
          this.logger.log(`Archive file not found: ${filePath}`);
          return null;
        }
        throw new Error(`Failed to download archive: ${response.status} ${response.statusText}`);
      }
      
      const jsonData = await response.text();
      const archiveFile: ArchiveFile = JSON.parse(jsonData);
      
      this.logger.log(`Successfully downloaded archive: ${filePath}`);
      return archiveFile;
    } catch (error) {
      this.logger.error(`Failed to download archive from cloud storage: ${error}`);
      return null;
    }
  }

  /**
   * Archive messages older than retention period
   */
  async archiveOldMessages(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - this.archiveRetentionMonths);

      this.logger.log(`Starting archive process for messages older than ${cutoffDate.toISOString()}`);

      // Get all chat rooms with old messages (only those that haven't been archived yet)
      const chatRoomsWithOldMessages = await this.prisma.chatRoom.findMany({
        where: {
          messages: {
            some: {
              createdAt: {
                lt: cutoffDate,
              },
            },
          },
        },
        include: {
          messages: {
            where: {
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
          },
        },
      });

      this.logger.log(`Found ${chatRoomsWithOldMessages.length} chat rooms with old messages to process`);

      let totalArchived = 0;
      let skippedRooms = 0;
      let processedRooms = 0;

      // Process chat rooms in batches to avoid memory issues
      const BATCH_SIZE = 5; // Process 5 chat rooms at a time
      
      for (let i = 0; i < chatRoomsWithOldMessages.length; i += BATCH_SIZE) {
        const batch = chatRoomsWithOldMessages.slice(i, i + BATCH_SIZE);
        
        this.logger.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chatRoomsWithOldMessages.length / BATCH_SIZE)} (${batch.length} chat rooms)`);
        
        for (const chatRoom of batch) {
          try {
            // Group messages by day for more granular archiving
            const messagesByDay = this.groupMessagesByDay(chatRoom.messages);
            
            let roomArchived = 0;
            for (const [dayKey, messages] of messagesByDay) {
              const [year, month, day] = dayKey.split('-').map(Number);
              
              // Check if archive already exists for this day
              const archiveExists = await this.hasArchivedMessages(chatRoom.id, year, month, day);
              
              if (archiveExists) {
                // Archive exists, skip this day (no need to append with daily archiving)
                this.logger.log(`Archive exists for chat room ${chatRoom.id}, ${year}-${month}-${day}. Skipping.`);
                continue;
              } else {
                // Create new archive for this day
                this.logger.log(`Creating new daily archive for chat room ${chatRoom.id}, ${year}-${month}-${day} (${messages.length} messages)`);
                await this.archiveMessagesForDay(chatRoom.id, year, month, day, messages);
              }
              roomArchived += messages.length;
            }
            
            if (roomArchived > 0) {
              totalArchived += roomArchived;
              processedRooms++;
            } else {
              skippedRooms++;
            }
            
          } catch (roomError) {
            this.logger.error(`Failed to process chat room ${chatRoom.id}:`, roomError);
            // Continue with next chat room instead of failing completely
          }
        }
        
        // Small delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < chatRoomsWithOldMessages.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      this.logger.log(`Archive process completed in ${duration.toFixed(2)}s. Archived: ${totalArchived} messages from ${processedRooms} chat rooms. Skipped: ${skippedRooms} rooms (already archived)`);
    } catch (error) {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      this.logger.error(`Archive process failed after ${duration.toFixed(2)}s:`, error);
      throw error;
    }
  }


  /**
   * Archive messages for a specific day
   */
  private async archiveMessagesForDay(
    chatRoomId: string,
    year: number,
    month: number,
    day: number,
    messages: any[],
  ): Promise<void> {
    let uploadedUrl: string | null = null;
    
    try {
      this.logger.log(`Starting archive process for ${messages.length} messages in chat room ${chatRoomId}, ${year}-${month}-${day}`);
      
      // Create archive file structure for daily archiving
      const archiveFile: ArchiveFile = {
        chatRoomId,
        year,
        month,
        messages: messages.map(msg => ({
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
        })),
        totalCount: messages.length,
        createdAt: new Date().toISOString(),
      };

      // Step 1: Upload to cloud storage first
      const filePath = this.getArchiveFilePath(chatRoomId, year, month, day);
      uploadedUrl = await this.uploadToCloudStorage(filePath, archiveFile);
      
      this.logger.log(`Successfully uploaded archive to cloud storage: ${uploadedUrl}`);

      // Step 2: Verify upload was successful by checking if file exists
      const verifyExists = await this.hasArchivedMessages(chatRoomId, year, month, day);
      if (!verifyExists) {
        throw new Error(`Archive upload verification failed for ${filePath}`);
      }
      
      this.logger.log(`Archive upload verified successfully for ${year}-${month}-${day}`);

      // Step 3: Only delete messages from database after successful upload and verification
      const messageIds = messages.map(msg => msg.id);
      
      // Use transaction to ensure atomicity
      await this.prisma.$transaction(async (tx) => {
        const deleteResult = await tx.message.deleteMany({
          where: {
            id: {
              in: messageIds,
            },
          },
        });
        
        this.logger.log(`Successfully deleted ${deleteResult.count} messages from database after archiving`);
      });

      this.logger.log(`Archive process completed successfully for chat room ${chatRoomId}, ${year}-${month}-${day}`);
      
    } catch (error) {
      this.logger.error(`Failed to archive messages for ${chatRoomId}, ${year}-${month}-${day}:`, error);
      
      // If upload succeeded but database deletion failed, try to clean up the uploaded file
      if (uploadedUrl) {
        try {
          const filePath = this.getArchiveFilePath(chatRoomId, year, month, day);
          this.logger.log(`Attempting to clean up uploaded archive file due to error: ${filePath}`);
          // Note: We would need to implement deleteObject in S3Service if not already present
          // For now, just log the issue
          this.logger.warn(`Archive file ${filePath} was uploaded but database cleanup failed. Manual cleanup may be required.`);
        } catch (cleanupError) {
          this.logger.error(`Failed to cleanup uploaded archive file: ${cleanupError}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Archive messages for a specific month (legacy method)
   */
  private async archiveMessagesForMonth(
    chatRoomId: string,
    year: number,
    month: number,
    messages: any[],
  ): Promise<void> {
    try {
      const archiveFile: ArchiveFile = {
        chatRoomId,
        year,
        month,
        messages: messages.map(msg => ({
          id: msg.id,
          chatRoomId: msg.chatRoomId,
          content: msg.content,
          senderId: msg.senderId,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date(msg.createdAt).toISOString(),
          updatedAt: msg.updatedAt instanceof Date ? msg.updatedAt.toISOString() : (msg.updatedAt ? new Date(msg.updatedAt).toISOString() : new Date(msg.createdAt).toISOString()),
          isRead: msg.isRead,
          fileUrl: msg.fileUrl,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          sender: {
            id: msg.sender.id,
            firstName: msg.sender.firstName,
            lastName: msg.sender.lastName,
          },
        })),
        totalCount: messages.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const filePath = this.getArchiveFilePath(chatRoomId, year, month);
      const archiveUrl = await this.uploadToCloudStorage(filePath, archiveFile);

      this.logger.log(`Successfully archived ${messages.length} messages for chat room ${chatRoomId}, ${year}-${month} to ${archiveUrl}`);

      // Delete messages from database after successful upload
      const messageIds = messages.map(msg => msg.id);
      await this.prisma.message.deleteMany({
        where: {
          id: {
            in: messageIds,
          },
        },
      });

      this.logger.log(`Deleted ${messageIds.length} archived messages from database`);
    } catch (error) {
      this.logger.error(`Failed to archive messages for chat room ${chatRoomId}, ${year}-${month}:`, error);
      throw error;
    }
  }

  /**
   * Append new messages to existing archive
   */
  private async appendToExistingArchive(
    chatRoomId: string,
    year: number,
    month: number,
    newMessages: any[],
  ): Promise<void> {
    try {
      // Download existing archive
      const existingFilePath = this.getArchiveFilePath(chatRoomId, year, month);
      const existingArchive = await this.downloadFromCloudStorage(existingFilePath);
      
      if (!existingArchive) {
        this.logger.error(`Failed to download existing archive for ${chatRoomId}, ${year}-${month}`);
        return;
      }

      // Performance check: if archive is too large, split it
      const totalMessages = existingArchive.messages.length + newMessages.length;
      if (totalMessages > this.LARGE_ARCHIVE_THRESHOLD) {
        this.logger.warn(`Archive for ${chatRoomId}, ${year}-${month} will have ${totalMessages} messages. Consider splitting.`);
        // For now, continue but log warning
      }

      // Transform new messages to ArchiveMessage format
      const newArchiveMessages: ArchiveMessage[] = newMessages.map(msg => ({
        id: msg.id,
        chatRoomId: msg.chatRoomId,
        content: msg.content,
        senderId: msg.senderId,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date(msg.createdAt).toISOString(),
        updatedAt: msg.updatedAt instanceof Date ? msg.updatedAt.toISOString() : (msg.updatedAt ? new Date(msg.updatedAt).toISOString() : new Date(msg.createdAt).toISOString()),
        isRead: msg.isRead,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        sender: {
          id: msg.sender.id,
          firstName: msg.sender.firstName,
          lastName: msg.sender.lastName,
        },
      }));

      // Combine existing and new messages, sorted by createdAt
      // Optimize sorting for large arrays
      const combinedMessages = [...existingArchive.messages, ...newArchiveMessages];
      
      if (combinedMessages.length > this.EFFICIENT_SORT_THRESHOLD) {
        // Use more efficient sorting for large arrays
        this.logger.log(`Sorting large archive with ${combinedMessages.length} messages`);
        combinedMessages.sort((a, b) => {
          // Compare ISO strings directly for better performance
          return a.createdAt.localeCompare(b.createdAt);
        });
      } else {
        // Standard sorting for smaller arrays
        combinedMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }

      // Create updated archive file
      const updatedArchiveFile: ArchiveFile = {
        chatRoomId,
        year,
        month,
        messages: combinedMessages,
        totalCount: combinedMessages.length,
        createdAt: existingArchive.createdAt, // Keep original creation date
        updatedAt: new Date().toISOString(), // Update modification time
      };

      // Upload updated archive
      const filePath = this.getArchiveFilePath(chatRoomId, year, month);
      const archiveUrl = await this.uploadToCloudStorage(filePath, updatedArchiveFile);

      this.logger.log(`Successfully appended ${newMessages.length} messages to existing archive for chat room ${chatRoomId}, ${year}-${month}. Total messages: ${combinedMessages.length}`);

      // Delete new messages from database after successful upload
      const messageIds = newMessages.map(msg => msg.id);
      await this.prisma.message.deleteMany({
        where: {
          id: {
            in: messageIds,
          },
        },
      });

      this.logger.log(`Deleted ${messageIds.length} messages from database after appending to archive`);
    } catch (error) {
      this.logger.error(`Failed to append messages to existing archive for ${chatRoomId}, ${year}-${month}:`, error);
      throw error;
    }
  }

  /**
   * Split large archive into smaller chunks (for future implementation)
   */
  private async splitLargeArchive(
    chatRoomId: string,
    year: number,
    month: number,
    messages: ArchiveMessage[],
  ): Promise<void> {
    // Future implementation: split by weeks or message count
    // For now, just log the intention
    this.logger.log(`Future: Split archive ${chatRoomId}/${year}/${month} with ${messages.length} messages into smaller chunks`);
    
    // Could split by:
    // 1. Weeks within the month
    // 2. Message count (e.g., 10k messages per file)
    // 3. Time periods (e.g., every 7 days)
  }

  /**
   * Group messages by year, month and day
   */
  private groupMessagesByDay(messages: any[]): Map<string, ArchiveMessage[]> {
    const grouped = new Map<string, ArchiveMessage[]>();

    for (const message of messages) {
      // Skip messages without valid createdAt
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

      grouped.get(key)!.push({
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        chatRoomId: message.chatRoomId,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt ? message.updatedAt.toISOString() : message.createdAt.toISOString(),
        isRead: message.isRead,
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileSize: message.fileSize,
        sender: message.sender,
      });
    }

    return grouped;
  }

  /**
   * Get available archive days for a chat room (optimized version)
   */
  async getAvailableArchiveDays(chatRoomId: string): Promise<{ year: number; month: number; day: number; messageCount: number; createdAt: string }[]> {
    try {
      // Minimal logging in production
      
      // Use S3 listObjectsV2 to get all archive files at once
      const archivePrefix = `archive/chat-rooms/${chatRoomId}/`;
      
      const archives: { year: number; month: number; day: number; messageCount: number; createdAt: string }[] = [];
      
      try {
        // Get all objects with the chat room prefix
        const objects = await this.s3Service.listObjects(archivePrefix);
        
        for (const object of objects) {
          // Parse the file path to extract year, month, day
          // Expected format: archive/chat-rooms/{chatRoomId}/{year}/{month}/{day}.json
          const pathParts = object.Key.split('/');
          
          // Check if it's a daily archive file
          if (pathParts.length >= 6 && pathParts[5].endsWith('.json')) {
            const year = parseInt(pathParts[3], 10);
            const month = parseInt(pathParts[4], 10);
            const dayStr = pathParts[5].replace('.json', '');
            const day = parseInt(dayStr, 10);
            
            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
              // Add archive with S3 metadata only (no message download for speed)
              archives.push({
                year,
                month,
                day,
                messageCount: 0, // Will be fetched when archive is actually loaded
                createdAt: object.LastModified?.toISOString() || new Date().toISOString(),
              });
            } else {
              // keep warn for unexpected structure
              this.logger.warn(`Invalid date parts for ${object.Key}: year=${year}, month=${month}, day=${day}`);
            }
          } else {
            // skip non-json objects silently
          }
        }
        
        // Sort archives by date (newest first)
        archives.sort((a, b) => {
          const dateA = new Date(a.year, a.month - 1, a.day);
          const dateB = new Date(b.year, b.month - 1, b.day);
          return dateB.getTime() - dateA.getTime();
        });
        
        // Return assembled archives
        return archives;
      } catch (s3Error) {
        this.logger.error(`Failed to list S3 objects for ${chatRoomId}:`, s3Error);
        // Fallback to empty array if S3 listing fails
        return [];
      }
    } catch (error) {
      this.logger.error(`Failed to get available archive days for ${chatRoomId}:`, error);
      throw error;
    }
  }

  /**
   * Get next available archive (most recent one)
   */
  async getNextAvailableArchive(chatRoomId: string): Promise<{ year: number; month: number; messageCount: number } | null> {
    try {
      // Get the oldest message date from database to determine where archives might start
      const oldestMessage = await this.prisma.message.findFirst({
        where: {
          chatRoomId: chatRoomId,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          createdAt: true,
        },
      });

      if (!oldestMessage) {
        return null; // No messages in this chat room
      }

      const oldestDate = new Date(oldestMessage.createdAt);
      const currentDate = new Date();
      
      // Calculate months from oldest message to current date
      const archives: { year: number; month: number; messageCount: number }[] = [];
      
      let checkDate = new Date(oldestDate.getFullYear(), oldestDate.getMonth(), 1);
      
      while (checkDate < currentDate) {
        const year = checkDate.getFullYear();
        const month = checkDate.getMonth() + 1;
        
        // Check if archive exists for this month
        const exists = await this.hasArchivedMessages(chatRoomId, year, month);
        
        if (exists) {
          // Try to get message count from archive
          try {
            const archiveFile = await this.downloadFromCloudStorage(
              this.getArchiveFilePath(chatRoomId, year, month)
            );
            
            if (archiveFile) {
              archives.push({
                year,
                month,
                messageCount: archiveFile.totalCount,
              });
            }
          } catch (error) {
            this.logger.warn(`Failed to get message count for archive ${year}-${month}:`, error);
            archives.push({
              year,
              month,
              messageCount: 0,
            });
          }
        }
        
        // Move to next month
        checkDate.setMonth(checkDate.getMonth() + 1);
      }
      
      // Return the most recent archive (last in the array)
      return archives.length > 0 ? archives[archives.length - 1] : null;
    } catch (error) {
      this.logger.error(`Failed to get next available archive for ${chatRoomId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up archives older than 1 year
   */
  async cleanupOldArchives(): Promise<{ deletedCount: number; deletedArchives: string[] }> {
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      this.logger.log(`Starting cleanup of archives older than ${oneYearAgo.toISOString()}`);
      
      // Get all chat rooms
      const chatRooms = await this.prisma.chatRoom.findMany({
        select: { id: true },
      });
      
      let totalDeleted = 0;
      const deletedArchives: string[] = [];
      
      for (const chatRoom of chatRooms) {
        // Get available archives for this chat room
        const archives = await this.getAvailableArchiveDays(chatRoom.id);
        
        for (const archive of archives) {
          const archiveDate = new Date(archive.year, archive.month - 1, archive.day);
          
          if (archiveDate < oneYearAgo) {
            try {
              // Delete from S3
              const filePath = this.getArchiveFilePath(chatRoom.id, archive.year, archive.month, archive.day);
              await this.s3Service.deleteObject(filePath);
              
              deletedArchives.push(`${chatRoom.id}/${archive.year}/${archive.month}/${archive.day}`);
              totalDeleted++;
              
              this.logger.log(`Deleted old archive: ${filePath}`);
            } catch (error) {
              this.logger.error(`Failed to delete archive ${chatRoom.id}/${archive.year}/${archive.month}/${archive.day}:`, error);
            }
          }
        }
      }
      
      this.logger.log(`Cleanup completed. Deleted ${totalDeleted} archives older than 1 year`);
      
      return {
        deletedCount: totalDeleted,
        deletedArchives,
      };
    } catch (error) {
      this.logger.error('Failed to cleanup old archives:', error);
      throw error;
    }
  }

  /**
   * Load archived messages for a specific day
   * Only returns messages created after the user joined the chat room
   */
  async loadArchivedMessages(
    chatRoomId: string,
    year: number,
    month: number,
    day?: number,
    userId?: string,
  ): Promise<ArchiveFile | null> {
    try {
      const filePath = this.getArchiveFilePath(chatRoomId, year, month, day);
      const archiveFile = await this.downloadFromCloudStorage(filePath);
      
      if (!archiveFile) {
        return null;
      }

      // If userId is provided, filter messages by user's join date
      if (userId) {
        const userJoinDate = await this.getUserJoinDate(chatRoomId, userId);
        
        if (userJoinDate) {
          const filteredMessages = this.filterMessagesByJoinDate(archiveFile.messages, userJoinDate);
          
          // Update the archive file with filtered messages
          const filteredArchiveFile: ArchiveFile = {
            ...archiveFile,
            messages: filteredMessages,
            totalCount: filteredMessages.length,
          };
          
          this.logger.log(`Loaded ${filteredMessages.length} archived messages (filtered by join date) for ${chatRoomId}, ${year}-${month}${day ? `-${day}` : ''}`);
          return filteredArchiveFile;
        }
      }
      
      this.logger.log(`Loaded ${archiveFile.messages.length} archived messages for ${chatRoomId}, ${year}-${month}${day ? `-${day}` : ''}`);
      return archiveFile;
    } catch (error) {
      this.logger.error(`Failed to load archived messages for ${chatRoomId}, ${year}-${month}${day ? `-${day}` : ''}:`, error);
      return null;
    }
  }

  /**
   * Check if messages exist in archive for a specific period
   */
  async hasArchivedMessages(
    chatRoomId: string,
    year: number,
    month: number,
    day?: number,
  ): Promise<boolean> {
    try {
      const filePath = this.getArchiveFilePath(chatRoomId, year, month, day);
      const bucket = process.env.WASABI_BUCKET || 'tms-chat';
      const endpoint = process.env.WASABI_ENDPOINT || 'https://s3.eu-central-1.wasabisys.com';
      const fullUrl = `${endpoint}/${bucket}/${filePath}`;
      
      this.logger.log(`Checking if archived messages exist at: ${fullUrl}`);
      
      // Check if file exists by making a HEAD request
      const response = await fetch(fullUrl, { method: 'HEAD' });
      
      const exists = response.ok;
      this.logger.log(`Archive exists for ${chatRoomId}, ${year}-${month}${day ? `-${day}` : ''}: ${exists}`);
      
      return exists;
    } catch (error) {
      this.logger.error(`Failed to check archive existence for ${chatRoomId}, ${year}-${month}${day ? `-${day}` : ''}:`, error);
      return false;
    }
  }
}
