import {
	Controller,
	Get,
	Put,
	Delete,
	Post,
	Body,
	Param,
	Query,
	UseGuards,
} from '@nestjs/common';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ImportDriversDto } from './dto/import-drivers.dto';
import { ImportUsersDto } from './dto/import-users.dto';
import { ImportDriversService } from './services/import-drivers.service';
import { ImportDriversBackgroundService } from './services/import-drivers-background.service';
import { ImportUsersService } from './services/import-users.service';
import { ImportUsersBackgroundService } from './services/import-users-background.service';
import { UserRole, UserStatus } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
	constructor(
		private readonly usersService: UsersService,
		private readonly importDriversService: ImportDriversService,
		private readonly importDriversBackgroundService: ImportDriversBackgroundService,
		private readonly importUsersService: ImportUsersService,
		private readonly importUsersBackgroundService: ImportUsersBackgroundService,
	) {}

	@Post('import-drivers')
	@SkipAuth()
	@ApiOperation({
		summary: 'Start background import of drivers from external TMS API (No auth required)',
		description: `Starts a background import process for drivers from external TMS API using job queues.
		
**External API:** https://www.endurance-tms.com/wp-json/tms/v1/drivers

**Process:**
1. Creates a background job to import drivers
2. Job processes pages sequentially with delays
3. Returns job ID for status tracking
4. Use /v1/users/import-status/{jobId} to check progress

**Benefits:**
- No timeout issues for large datasets
- Background processing
- Progress tracking
- Automatic retry on failures
- Duplicate email tracking`,
	})
	@ApiResponse({
		status: 200,
		description: 'Import job started successfully',
		schema: {
			type: 'object',
			properties: {
				jobId: { type: 'string' },
				message: { type: 'string' },
			},
			example: {
				jobId: 'import-1695998400000',
				message: 'Import process started. Job ID: import-1695998400000. Check status at /v1/users/import-status/import-1695998400000',
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Import failed to start',
	})
	async importDrivers(@Body() importDriversDto: ImportDriversDto) {
		return this.importDriversBackgroundService.startImport(
			importDriversDto.page,
			importDriversDto.per_page,
			importDriversDto.search,
		);
	}

	@Get('import-status/:jobId')
	@SkipAuth()
	@ApiOperation({
		summary: 'Get import job status',
		description: 'Returns the current status and progress of an import job',
	})
	@ApiResponse({
		status: 200,
		description: 'Import status retrieved successfully',
		schema: {
			type: 'object',
			properties: {
				status: { type: 'string', enum: ['processing', 'completed', 'failed'] },
				progress: { type: 'number', description: 'Progress percentage' },
				processedPages: { type: 'number' },
				totalImported: { type: 'number' },
				totalUpdated: { type: 'number' },
				totalSkipped: { type: 'number', description: 'Number of drivers skipped due to duplicate emails' },
				duplicateEmails: { type: 'array', items: { type: 'number' }, description: 'Array of driver IDs with duplicate emails' },
				isComplete: { type: 'boolean' },
			},
			example: {
				status: 'processing',
				progress: 45.5,
				processedPages: 15,
				totalImported: 450,
				totalUpdated: 25,
				totalSkipped: 8,
				duplicateEmails: [3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110],
				isComplete: false,
			},
		},
	})
	async getImportStatus(@Param('jobId') jobId: string) {
		return this.importDriversBackgroundService.getImportStatus(jobId);
	}

	@Post('import-users')
	@SkipAuth()
	@ApiOperation({
		summary: 'Start background import of users from external TMS API (No auth required)',
		description: `Starts a background import process for users from external TMS API using job queues.
		
**External API:** https://www.endurance-tms.com/wp-json/tms/v1/users

**Process:**
1. Creates a background job to import users
2. Job processes pages sequentially with delays
3. Returns job ID for status tracking
4. Use /v1/users/import-users-status/{jobId} to check progress

**Benefits:**
- No timeout issues for large datasets
- Background processing
- Progress tracking
- Automatic retry on failures
- Duplicate email tracking`,
	})
	@ApiResponse({
		status: 200,
		description: 'Import job started successfully',
		schema: {
			type: 'object',
			properties: {
				jobId: { type: 'string' },
				message: { type: 'string' },
			},
			example: {
				jobId: 'import-users-1695998400000',
				message: 'Background import process started. Job ID: import-users-1695998400000. Check status at /v1/users/import-users-status/import-users-1695998400000',
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Import failed to start',
	})
	async importUsers(@Body() importUsersDto: ImportUsersDto) {
		return this.importUsersBackgroundService.startImport(
			importUsersDto.page,
			importUsersDto.per_page,
			importUsersDto.search,
		);
	}

	@Get('import-users-status/:jobId')
	@SkipAuth()
	@ApiOperation({
		summary: 'Get import users job status',
		description: 'Returns the current status and progress of an import users job',
	})
	@ApiResponse({
		status: 200,
		description: 'Import status retrieved successfully',
		schema: {
			type: 'object',
			properties: {
				status: { type: 'string', enum: ['processing', 'completed', 'failed'] },
				progress: { type: 'number', description: 'Progress percentage' },
				processedPages: { type: 'number' },
				totalImported: { type: 'number' },
				totalUpdated: { type: 'number' },
				totalSkipped: { type: 'number', description: 'Number of users skipped due to duplicate emails' },
				duplicateEmails: { type: 'array', items: { type: 'number' }, description: 'Array of user IDs with duplicate emails' },
				isComplete: { type: 'boolean' },
			},
			example: {
				status: 'processing',
				progress: 45.5,
				processedPages: 1,
				totalImported: 25,
				totalUpdated: 3,
				totalSkipped: 2,
				duplicateEmails: [82, 14],
				isComplete: false,
			},
		},
	})
	async getImportUsersStatus(@Param('jobId') jobId: string) {
		return this.importUsersBackgroundService.getImportStatus(jobId);
	}

	@Get()
	@ApiOperation({ summary: 'Get all users with pagination and filtering' })
	@ApiResponse({
		status: 200,
		description: 'Users retrieved successfully',
	})
	async findAllUsers(
		@Query('page') page?: string,
		@Query('limit') limit?: string,
		@Query('role') role?: UserRole,
		@Query('status') status?: UserStatus,
		@Query('search') search?: string,
		@Query('sort') sort?: string,
	) {
		let sortObj: { [key: string]: 'asc' | 'desc' } | undefined;

		if (sort) {
			try {
				sortObj = JSON.parse(sort) as { [key: string]: 'asc' | 'desc' };
			} catch {
				// If sort parameter is invalid, use default sorting
				sortObj = { createdAt: 'desc' };
			}
		}

		return this.usersService.findAllUsers(
			page ? parseInt(page, 10) : 1,
			limit ? parseInt(limit, 10) : 10,
			role,
			status,
			search,
			sortObj,
		);
	}

	@Get('external/:externalId')
	@ApiOperation({ summary: 'Get user by external ID' })
	@ApiResponse({
		status: 200,
		description: 'User retrieved successfully',
	})
	@ApiResponse({ status: 404, description: 'User not found' })
	async findUserByExternalId(@Param('externalId') externalId: string) {
		return this.usersService.findUserByExternalId(externalId);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get user by ID' })
	@ApiResponse({
		status: 200,
		description: 'User retrieved successfully',
	})
	@ApiResponse({ status: 404, description: 'User not found' })
	async findUserById(@Param('id') id: string) {
		return this.usersService.findUserById(id);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update user (Admin only)' })
	@ApiResponse({
		status: 200,
		description: 'User updated successfully',
	})
	@ApiResponse({ status: 404, description: 'User not found' })
	async updateUser(
		@Param('id') id: string,
		@Body() updateUserDto: UpdateUserDto,
	) {
		return this.usersService.updateUser(id, updateUserDto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete user (Admin only)' })
	@ApiResponse({
		status: 200,
		description: 'User deleted successfully',
	})
	@ApiResponse({ status: 404, description: 'User not found' })
	async deleteUser(@Param('id') id: string) {
		return this.usersService.deleteUser(id);
	}

	@Put(':id/status')
	@ApiOperation({ summary: 'Change user status (Admin only)' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				status: {
					type: 'string',
					enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'],
					description: 'New user status',
					example: 'ACTIVE',
				},
			},
			required: ['status'],
		},
	})
	@ApiResponse({
		status: 200,
		description: 'User status updated successfully',
	})
	@ApiResponse({ status: 404, description: 'User not found' })
	async changeUserStatus(
		@Param('id') id: string,
		@Body('status') status: UserStatus,
	) {
		return this.usersService.changeUserStatus(id, status);
	}
}
