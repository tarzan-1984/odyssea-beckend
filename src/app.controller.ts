import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiResponse as ApiResponseType } from './shared/types/common.types';

@ApiTags('App')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Get application status' })
  @ApiResponse({
    status: 200,
    description: 'Application is running',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  })
  getStatus(): ApiResponseType<{ timestamp: string }> {
    return {
      success: true,
      message: 'Odyssea Backend is running',
      data: {
        timestamp: new Date().toISOString(),
      },
    };
  }
}
