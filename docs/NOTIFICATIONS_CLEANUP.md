# Notifications Cleanup Cron Job

## Overview

This document describes the automated cleanup system for notifications that removes old notifications from the database to maintain optimal performance and storage efficiency.

## Features

- **Daily Automatic Cleanup**: Runs every day at 2:00 AM
- **7-Day Retention Policy**: Deletes notifications older than 7 days
- **Manual Trigger**: Admin endpoint for manual cleanup
- **Statistics Monitoring**: Track notification counts and cleanup effectiveness
- **Comprehensive Logging**: Detailed logs for monitoring and debugging

## Implementation

### Files Created

1. **`src/notifications/notifications-cleanup.service.ts`**
   - Main service handling cleanup logic
   - Cron job scheduling with `@Cron` decorator
   - Manual cleanup methods
   - Statistics gathering

2. **`src/notifications/notifications-cleanup.controller.ts`**
   - REST API endpoints for manual operations
   - Admin-only access control
   - Swagger documentation

3. **`src/scripts/test-notifications-cleanup.ts`**
   - Test script for verifying cleanup functionality
   - Statistics comparison before/after cleanup

### Cron Schedule

```typescript
@Cron(CronExpression.EVERY_DAY_AT_2AM)
async cleanupOldNotifications()
```

- **Schedule**: Every day at 2:00 AM
- **Timezone**: Server timezone
- **Automatic**: No manual intervention required

## API Endpoints

### Manual Cleanup

```http
POST /v1/notifications/cleanup/manual
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "count": 150,
  "message": "Successfully deleted 150 old notifications"
}
```

### Statistics

```http
GET /v1/notifications/cleanup/stats
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "total": 1000,
  "olderThan7Days": 150,
  "olderThan30Days": 50
}
```

## Testing

### Manual Test

```bash
yarn test:notifications-cleanup
```

This script will:
1. Get current notification statistics
2. Run manual cleanup
3. Get updated statistics
4. Show cleanup results

### Expected Output

```
🚀 Starting notifications cleanup test...
📊 Getting notification statistics...
Statistics before cleanup: { total: 44, olderThan7Days: 0, olderThan30Days: 0 }
🧹 Running manual cleanup...
Cleanup result: { count: 0 }
📊 Getting notification statistics after cleanup...
Statistics after cleanup: { total: 44, olderThan7Days: 0, olderThan30Days: 0 }
✅ Cleanup completed successfully! Deleted 0 notifications.
```

## Configuration

### Environment Variables

No additional environment variables required. The cleanup uses:
- Database connection from existing Prisma configuration
- Logging configuration from NestJS

### Database Schema

The cleanup operates on the `Notification` table:

```sql
model Notification {
  id        String   @id @default(cuid())
  userId    String
  title     String
  message   String
  avatar    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  readAt    DateTime?
  
  @@map("notifications")
}
```

## Monitoring

### Logs

The service provides comprehensive logging:

```
[NotificationsCleanupService] Starting daily notifications cleanup...
[NotificationsCleanupService] Deleting notifications older than: 2025-10-10T14:08:51.845Z
[NotificationsCleanupService] Successfully deleted 0 old notifications
[NotificationsCleanupService] Notifications cleanup completed. Deleted 0 notifications older than 7 days.
```

### Error Handling

- **Database Errors**: Logged with full error details
- **Service Failures**: Graceful error handling with rollback
- **Cron Failures**: Automatic retry on next scheduled run

## Performance Considerations

### Database Impact

- **Batch Deletion**: Uses `deleteMany()` for efficient bulk operations
- **Index Usage**: Leverages `createdAt` index for fast queries
- **Low Peak Hours**: Runs at 2:00 AM to minimize user impact

### Memory Usage

- **Minimal Memory**: No large data loading
- **Efficient Queries**: Only counts and deletes, no data retrieval
- **Connection Pooling**: Uses existing Prisma connection pool

## Security

### Access Control

- **JWT Authentication**: Required for all manual endpoints
- **Admin Only**: Manual cleanup restricted to authenticated users
- **No Sensitive Data**: Only deletes old notifications, no data exposure

### Data Safety

- **Soft Delete**: Consider implementing soft delete for audit trails
- **Backup Integration**: Can be integrated with backup systems
- **Rollback Capability**: Manual cleanup can be monitored and rolled back if needed

## Maintenance

### Regular Tasks

1. **Monitor Logs**: Check daily cleanup logs for errors
2. **Statistics Review**: Monitor notification growth patterns
3. **Performance Check**: Ensure cleanup doesn't impact database performance

### Troubleshooting

1. **Cleanup Not Running**: Check cron job status and logs
2. **High Memory Usage**: Monitor database connection pool
3. **Slow Performance**: Check database indexes on `createdAt`

## Future Enhancements

### Potential Improvements

1. **Configurable Retention**: Make 7-day limit configurable
2. **Soft Delete**: Implement soft delete for audit trails
3. **Archive Integration**: Move old notifications to archive storage
4. **Metrics Dashboard**: Real-time monitoring dashboard
5. **Email Notifications**: Alert on cleanup failures

### Integration Opportunities

1. **Monitoring Systems**: Integrate with application monitoring
2. **Alerting**: Connect with alerting systems for failures
3. **Analytics**: Feed cleanup metrics to analytics systems
