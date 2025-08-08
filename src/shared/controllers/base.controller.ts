import { Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiResponse as ApiResponseType } from '../types/common.types';

export abstract class BaseController {
  /**
   * Health check endpoint
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        timestamp: { type: 'string' },
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
}
