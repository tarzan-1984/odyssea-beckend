import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * Initialize Prisma client when the module is initialized
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * Disconnect Prisma client when the module is destroyed
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Clean up database (useful for testing)
   */
  cleanDatabase(): void {
    if (process.env.NODE_ENV === 'test') {
      // Add cleanup logic for test environment
      // This will be implemented when we have models
    }
  }
}
