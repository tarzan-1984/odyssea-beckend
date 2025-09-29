import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ImportDriversQueueService, ImportJobData, ImportJobResult } from '../services/import-drivers-queue.service';

@Processor('import-drivers')
export class ImportDriversProcessor {
  private readonly logger = new Logger(ImportDriversProcessor.name);

  constructor(private readonly importDriversQueueService: ImportDriversQueueService) {}

  @Process('import-page')
  async handleImportPage(job: Job<ImportJobData>): Promise<ImportJobResult> {
    this.logger.log(`Processing import page job ${job.id} for job ${job.data.jobId}`);
    
    try {
      const result = await this.importDriversQueueService.processImportPage(job);
      
      this.logger.log(`Completed import page job ${job.id}: ${result.imported} imported, ${result.updated} updated`);
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to process import page job ${job.id}:`, error);
      throw error;
    }
  }
}
