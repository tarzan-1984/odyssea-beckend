# User Schema Refactoring Documentation

## Overview

This document outlines the changes made to the user management system to support a hybrid data storage approach where basic user data is stored locally in PostgreSQL while comprehensive user data is stored on an external server. The system now supports TMS webhook integration for real-time user synchronization.

## Changes Made

### 1. Database Schema Updates (`prisma/schema.prisma`)

#### User Model Changes

- **Kept fields**: `id`, `email`, `firstName`, `lastName`, `phone`, `role`, `status`, `createdAt`, `updatedAt`, `lastLoginAt`
- **Added fields**:
    - `externalId` (String?, @unique) - Links to external service user ID
    - `profilePhoto` (String?) - User profile photo URL
    - `location` (String?) - User location
    - `state` (String?) - State/Province
    - `zip` (String?) - ZIP/Postal code
    - `city` (String?) - City

#### Removed Enums

- `VehicleType` - No longer needed
- `DistanceCoverage` - No longer needed

### 2. DTO Updates

#### CreateUserDto & UpdateUserDto

- Updated to include the new fields: `profilePhoto`, `location`, `state`, `zip`, `city`
- Added `externalId` as optional field

#### New WebhookSyncDto

- Created for TMS webhook integration
- Supports both driver and employee data structures
- Handles add, update, and delete operations
- Includes proper validation and type definitions

#### Legacy SyncUserDto

- Maintained for backward compatibility
- Simple structure for basic synchronization

### 3. Service Layer Updates (`users.service.ts`)

#### Updated Methods

- All Prisma queries updated to include new fields in select clauses
- `updateUserProfile` method updated to allow new fields
- Added `findUserByExternalId()` method
- Added `syncUser()` method for legacy external service integration

#### New Webhook Processing Methods

```typescript
async processWebhookSync(webhookData: WebhookSyncDto) {
  // Main webhook processor for TMS integration
  // Routes to driver or employee handlers
}

private async processDriverWebhook(type, driverData, driverId) {
  // Handles driver add/update/delete operations
  // Maps TMS driver data to local user structure
}

private async processEmployeeWebhook(type, userData, userId) {
  // Handles employee add/update/delete operations
  // Maps TMS employee data to local user structure
  // Includes role mapping from TMS to local roles
}
```

### 4. Enhanced Sync Endpoints

#### SyncController

- **Main Endpoint**: `POST /sync-db` - TMS webhook integration
- **Legacy Endpoint**: `POST /sync-db/legacy` - Backward compatibility
- **Authentication**: API Key (not JWT)
- **Security**: Protected by `ApiKeyGuard`

#### Webhook Support

- **Driver Operations**: Add, update, delete drivers
- **Employee Operations**: Add, update, delete employees
- **Role Mapping**: TMS roles mapped to local UserRole enum
- **Data Transformation**: TMS data structure converted to local format

### 5. TMS Webhook Integration

#### Supported Webhook Types

1. **Driver Add/Update/Delete**

    ```json
    {
      "type": "add|update|delete",
      "role": "driver",
      "timestamp": "2025-09-12 04:31:45",
      "source": "tms-statistics",
      "driver_data": { ... } // for add/update
      "driver_id": "122" // for delete
    }
    ```

2. **Employee Add/Update/Delete**
    ```json
    {
      "type": "add|update|delete",
      "role": "employee",
      "timestamp": "2025-09-12 04:15:13",
      "source": "tms-statistics",
      "user_data": { ... } // for add/update
      "user_id": 29 // for delete
    }
    ```

#### Role Mapping

- `dispatcher` → `DISPATCHER_EXPEDITE`
- `admin` → `ADMINISTRATOR`
- `manager` → `EXPEDITE_MANAGER`
- Default → `DRIVER`

### 6. Configuration Updates

#### Environment Variables

- Added `EXTERNAL_API_KEY` to `env.example`
- Integrated into NestJS `ConfigModule`

#### App Module

- Added `externalApiConfig` to configuration loading

### 7. Testing Updates

- Updated all test files to reflect new schema
- Added comprehensive webhook tests
- Fixed dependency injection issues in module tests
- Created dedicated webhook controller tests

## API Endpoints

### For TMS System (API Key Authentication)

- `POST /sync-db` - TMS webhook integration (main endpoint)
- `POST /sync-db/legacy` - Legacy sync endpoint

### For Frontend (JWT Authentication)

- `GET /users/external/:externalId` - Find user by external ID
- All existing user endpoints updated for new schema

## Data Flow

1. **TMS Integration**: TMS system sends webhook data to `/sync-db`
2. **Data Processing**: System processes webhook and updates local database
3. **Frontend Display**: Comprehensive user data fetched from external backend
4. **Chat Functionality**: Basic user data (name, email, phone, role, location) fetched from local PostgreSQL
5. **Real-time Sync**: Changes in TMS automatically sync to local database

## Migration Notes

- Database changes applied using `prisma db push`
- All existing user data preserved (only schema structure changed)
- TMS webhook integration ready for production
- Backward compatibility maintained for existing API endpoints
- Seed scripts updated to work with new schema

## Security Considerations

- Sync endpoint protected by API key authentication
- TMS system must provide valid API key in `x-api-key` header
- JWT authentication still required for frontend endpoints
- Webhook data validated using DTOs with proper type checking
- No sensitive data exposed in sync endpoint

## TMS Integration Examples

### Adding a Driver

```bash
curl -X POST http://localhost:3000/sync-db \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "add",
    "role": "driver",
    "timestamp": "2025-09-12 04:31:45",
    "source": "tms-statistics",
    "driver_data": {
      "driver_id": "3343",
      "driver_name": "Test Driver 2",
      "driver_email": "tdev13105@gmail.com",
      "driver_phone": "(013) 242-3423",
      "home_location": "NM",
      "vehicle_type": "sprinter-van",
      "vin": "44444421224"
    }
  }'
```

### Adding an Employee

```bash
curl -X POST http://localhost:3000/sync-db \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "add",
    "role": "employee",
    "timestamp": "2025-09-12 04:15:13",
    "source": "tms-statistics",
    "user_data": {
      "id": 33,
      "user_email": "milchenko2k16+11111222@gmail.com",
      "display_name": "Serhii Milchenko",
      "first_name": "Serhii",
      "last_name": "Milchenko",
      "roles": ["dispatcher"],
      "user_registered": "2025-09-12 08:14:45",
      "acf_fields": {
        "permission_view": ["Odysseia", "Martlet", "Endurance"],
        "initials_color": "#0d6efd",
        "work_location": "pl",
        "phone_number": "(667) 290-9332",
        "flt": false
      }
    }
  }'
```

## Next Steps

1. Configure `EXTERNAL_API_KEY` in production environment
2. Set up TMS system to send webhook data to `/sync-db`
3. Update frontend to fetch comprehensive data from external service
4. Test end-to-end webhook synchronization flow
5. Monitor webhook processing and error handling
6. Set up logging and monitoring for webhook operations
