import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotificationsCleanupService {
    private readonly logger = new Logger(NotificationsCleanupService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Cron job that runs daily at 2:00 AM to clean up old notifications
     */
    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async cleanupOldNotifications() {
        this.logger.log('Starting daily notifications cleanup...');
        
        try {
            const result = await this.deleteOldNotifications();
            this.logger.log(`Notifications cleanup completed. Deleted ${result.count} notifications older than 7 days.`);
        } catch (error) {
            this.logger.error('Failed to cleanup old notifications:', error);
        }
    }

    /**
     * Delete notifications older than 7 days
     */
    async deleteOldNotifications(): Promise<{ count: number }> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        this.logger.log(`Deleting notifications older than: ${sevenDaysAgo.toISOString()}`);

        const result = await this.prisma.notification.deleteMany({
            where: {
                createdAt: {
                    lt: sevenDaysAgo,
                },
            },
        });

        this.logger.log(`Successfully deleted ${result.count} old notifications`);
        return result;
    }

    /**
     * Manual cleanup method for testing or manual execution
     */
    async manualCleanup(): Promise<{ count: number }> {
        this.logger.log('Starting manual notifications cleanup...');
        return await this.deleteOldNotifications();
    }

    /**
     * Get statistics about notifications (for monitoring)
     */
    async getNotificationStats(): Promise<{
        total: number;
        olderThan7Days: number;
        olderThan30Days: number;
    }> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [total, olderThan7Days, olderThan30Days] = await Promise.all([
            this.prisma.notification.count(),
            this.prisma.notification.count({
                where: {
                    createdAt: {
                        lt: sevenDaysAgo,
                    },
                },
            }),
            this.prisma.notification.count({
                where: {
                    createdAt: {
                        lt: thirtyDaysAgo,
                    },
                },
            }),
        ]);

        return {
            total,
            olderThan7Days,
            olderThan30Days,
        };
    }
}
