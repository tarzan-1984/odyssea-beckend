import { Controller, Post, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsCleanupService } from './notifications-cleanup.service';

@ApiTags('Notifications Cleanup')
@Controller('notifications/cleanup')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsCleanupController {
    constructor(
        private readonly notificationsCleanupService: NotificationsCleanupService,
    ) {}

    @Post('manual')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Manually trigger notifications cleanup',
        description: 'Manually delete notifications older than 7 days. This is normally handled by a daily cron job.',
    })
    @ApiResponse({
        status: 200,
        description: 'Cleanup completed successfully',
        schema: {
            example: {
                count: 150,
                message: 'Successfully deleted 150 old notifications',
            },
        },
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token',
    })
    @ApiResponse({
        status: 403,
        description: 'Forbidden - authentication required',
    })
    async manualCleanup() {
        const result = await this.notificationsCleanupService.manualCleanup();
        return {
            count: result.count,
            message: `Successfully deleted ${result.count} old notifications`,
        };
    }

    @Get('stats')
    @ApiOperation({
        summary: 'Get notifications statistics',
        description: 'Get statistics about notifications including counts of old notifications.',
    })
    @ApiResponse({
        status: 200,
        description: 'Statistics retrieved successfully',
        schema: {
            example: {
                total: 1000,
                olderThan7Days: 150,
                olderThan30Days: 50,
            },
        },
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized - invalid or missing JWT token',
    })
    @ApiResponse({
        status: 403,
        description: 'Forbidden - authentication required',
    })
    async getStats() {
        return await this.notificationsCleanupService.getNotificationStats();
    }
}
