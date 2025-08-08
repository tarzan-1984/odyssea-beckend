import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { BaseController } from './shared/controllers/base.controller';
import { ApiResponse as ApiResponseType } from './shared/types/common.types';

@ApiTags('App')
@Controller()
export class AppController extends BaseController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
  ) {
    super();
  }

  @Get()
  @ApiOperation({ summary: 'Get application info' })
  @ApiResponse({
    status: 200,
    description: 'Application information',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
  })
  getHello(): ApiResponseType<{ message: string; version: string }> {
    return {
      success: true,
      data: {
        message: this.appService.getHello(),
        version: '1.0.0',
      },
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get application health status' })
  @ApiResponse({
    status: 200,
    description: 'Health status',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            timestamp: { type: 'string' },
          },
        },
      },
    },
  })
  getHealth(): ApiResponseType<{ timestamp: string }> {
    return {
      success: true,
      message: 'Service is healthy',
      data: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('db-health')
  @ApiOperation({ summary: 'Check database connection' })
  @ApiResponse({
    status: 200,
    description: 'Database health status',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            userCount: { type: 'number' },
            tables: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  async getDatabaseHealth(): Promise<ApiResponseType<{
    connected: boolean;
    userCount: number;
    tables: string[];
  }>> {
    try {
      // Test database connection
      await this.prismaService.$connect();
      
      // Get user count
      const userCount = await this.prismaService.user.count();
      
      // Get available tables
      const tables = await this.prismaService.$queryRaw<{ table_name: string }[]>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;

      return {
        success: true,
        message: 'Database connection successful',
        data: {
          connected: true,
          userCount,
          tables: tables.map(t => t.table_name),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Database connection failed',
        data: {
          connected: false,
          userCount: 0,
          tables: [],
        },
      };
    }
  }
}
