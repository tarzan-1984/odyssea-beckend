import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { ExternalDriver, ExternalApiResponse } from '../interfaces/external-driver.interface';
import { UserRole, UserStatus } from '@prisma/client';
import axios from 'axios';

export interface ImportJobData {
  page: number;
  per_page: number;
  search?: string;
  jobId: string;
}

export interface ImportJobResult {
  imported: number;
  updated: number;
  page: number;
  hasMorePages: boolean;
}

@Injectable()
export class ImportDriversQueueService {
  private readonly logger = new Logger(ImportDriversQueueService.name);
  private readonly EXTERNAL_API_URL = 'https://www.endurance-tms.com/wp-json/tms/v1/drivers';
  private readonly API_KEY = 'tms_api_key_2024_driver_access';
  private readonly REQUEST_TIMEOUT = 60000;

  constructor(
    @InjectQueue('import-drivers') private importQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Normalize permission_view to our allowed company values.
   */
  private normalizeCompany(value?: string[] | null): string[] {
    if (!Array.isArray(value) || value.length === 0) return [];
    const allowedMap = new Map<string, 'Odysseia' | 'Martlet' | 'Endurance'>([
      ['odysseia', 'Odysseia'],
      ['martlet', 'Martlet'],
      ['endurance', 'Endurance'],
    ]);
    const normalized: Array<'Odysseia' | 'Martlet' | 'Endurance'> = [];
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const canon = allowedMap.get(item.trim().toLowerCase());
      if (!canon) continue;
      if (!normalized.includes(canon)) normalized.push(canon);
    }
    return normalized;
  }

  /**
   * Start import process by adding jobs to queue
   */
  async startImport(page: number, per_page: number, search?: string): Promise<{ jobId: string; message: string }> {
    const jobId = `import-${Date.now()}`;
    
    // Add initial job to queue
    const job = await this.importQueue.add('import-page', {
      page,
      per_page,
      search,
      jobId,
    } as ImportJobData);

    this.logger.log(`Import job started with ID: ${jobId}, Queue job ID: ${job.id}`);

    return {
      jobId,
      message: `Import process started. Job ID: ${jobId}. Check status at /v1/users/import-status/${jobId}`,
    };
  }

  /**
   * Process a single page import
   */
  async processImportPage(job: Job<ImportJobData>): Promise<ImportJobResult> {
    const { page, per_page, search, jobId } = job.data;
    
    this.logger.log(`Processing page ${page} for job ${jobId}`);

    try {
      // Fetch data from external API
      const response = await this.fetchExternalDrivers(page, per_page, search);
      
      if (!response.success) {
        throw new Error('External API returned unsuccessful response');
      }

      // Process drivers
      const result = await this.processDriversBatch(response.data);
      
      this.logger.log(`Page ${page} processed: ${result.imported} imported, ${result.updated} updated`);

      // Check if there are more pages
      const hasMorePages = response.pagination.has_next_page;
      
      if (hasMorePages) {
        // Add next page job to queue
        await this.importQueue.add('import-page', {
          page: page + 1,
          per_page,
          search,
          jobId,
        } as ImportJobData, {
          delay: 2000, // 2 second delay between pages
        });
        
        this.logger.log(`Added next page ${page + 1} to queue for job ${jobId}`);
      } else {
        this.logger.log(`Import completed for job ${jobId}`);
      }

      return {
        imported: result.imported,
        updated: result.updated,
        page,
        hasMorePages,
      };

    } catch (error) {
      this.logger.error(`Failed to process page ${page} for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get import job status
   */
  async getImportStatus(jobId: string): Promise<{
    status: string;
    progress: number;
    totalPages?: number;
    processedPages: number;
    totalImported: number;
    totalUpdated: number;
    isComplete: boolean;
  }> {
    const jobs = await this.importQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
    const jobJobs = jobs.filter(job => job.data.jobId === jobId);
    
    const completedJobs = jobJobs.filter(job => job.finishedOn);
    const failedJobs = jobJobs.filter(job => job.failedReason);
    const activeJobs = jobJobs.filter(job => !job.finishedOn && !job.failedReason);

    const totalImported = completedJobs.reduce((sum, job) => sum + (job.returnvalue?.imported || 0), 0);
    const totalUpdated = completedJobs.reduce((sum, job) => sum + (job.returnvalue?.updated || 0), 0);

    const isComplete = activeJobs.length === 0 && failedJobs.length === 0;

    return {
      status: isComplete ? 'completed' : activeJobs.length > 0 ? 'processing' : 'failed',
      progress: jobJobs.length > 0 ? (completedJobs.length / jobJobs.length) * 100 : 0,
      processedPages: completedJobs.length,
      totalImported,
      totalUpdated,
      isComplete,
    };
  }

  /**
   * Fetch drivers from external API
   */
  private async fetchExternalDrivers(page: number, per_page: number, search?: string): Promise<ExternalApiResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: per_page.toString(),
    });

    if (search) {
      params.append('search', search);
    }

    const url = `${this.EXTERNAL_API_URL}?${params.toString()}`;

    try {
      const response = await axios.get<ExternalApiResponse>(url, {
        headers: {
          'X-API-Key': this.API_KEY,
        },
        timeout: this.REQUEST_TIMEOUT,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch external drivers:`, error);
      throw new Error(`Failed to fetch drivers from external API: ${error.message}`);
    }
  }

  /**
   * Process a batch of drivers
   */
  private async processDriversBatch(drivers: ExternalDriver[]): Promise<{ imported: number; updated: number }> {
    let imported = 0;
    let updated = 0;

    for (const driver of drivers) {
      try {
        const result = await this.processDriver(driver);
        if (result === 'imported') {
          imported++;
        } else if (result === 'updated') {
          updated++;
        }
      } catch (error) {
        this.logger.error(`Failed to process driver ${driver.id}:`, error);
      }

      // Small delay between drivers
      await this.delay(50);
    }

    return { imported, updated };
  }

  /**
   * Process a single driver
   */
  private async processDriver(driver: ExternalDriver): Promise<'imported' | 'updated' | 'skipped'> {
    // Split driver_name into firstName and lastName
    const driverName = driver.driver_name || '';
    const nameParts = driverName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Parse coordinates - handle empty strings and invalid values
    const parseCoordinate = (value: string | undefined): number | null => {
      if (!value || value.trim() === '') return null;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    };

    const permissionView = driver.permission_view ?? [];

    const userData = {
      externalId: driver.id.toString(),
      email: driver.driver_email || '',
      firstName: firstName,
      lastName: lastName,
      phone: driver.driver_phone || '',
      location: driver.home_location || '',
      type: driver.type || '',
      vin: driver.vin || '',
      driverStatus: driver.driver_status || null,
      latitude: parseCoordinate(driver.latitude),
      longitude: parseCoordinate(driver.longitude),
      company: this.normalizeCompany(permissionView),
      role: UserRole.DRIVER,
      status: UserStatus.INACTIVE,
      password: null,
    };

    // Check if user exists by externalId only
    const existingUser = await this.prisma.user.findUnique({
      where: { externalId: driver.id.toString() },
    });

    if (existingUser) {
      // User exists - update all fields including email
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phone: userData.phone,
          location: userData.location,
          type: userData.type,
          vin: userData.vin,
          driverStatus: userData.driverStatus,
          latitude: userData.latitude,
          longitude: userData.longitude,
          company: userData.company,
          role: userData.role,
          // Do not overwrite status, password, or profilePhoto for existing users.
        },
      });
      this.logger.log(`Updated driver ${driver.id} (externalId: ${driver.id.toString()}) with driverStatus: ${userData.driverStatus}, latitude: ${userData.latitude}, longitude: ${userData.longitude}`);
      return 'updated';
    } else {
      // User doesn't exist - create new one
      await this.prisma.user.create({
        data: userData,
      });
      this.logger.log(`Created new driver ${driver.id} (externalId: ${driver.id.toString()}) with driverStatus: ${userData.driverStatus}, latitude: ${userData.latitude}, longitude: ${userData.longitude}`);
      return 'imported';
    }
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
