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
	ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
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
		summary:
			'Start background import of drivers from external TMS API (No auth required)',
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
				message:
					'Import process started. Job ID: import-1695998400000. Check status at /v1/users/import-status/import-1695998400000',
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
				status: {
					type: 'string',
					enum: ['processing', 'completed', 'failed'],
				},
				progress: {
					type: 'number',
					description: 'Progress percentage',
				},
				processedPages: { type: 'number' },
				totalImported: { type: 'number' },
				totalUpdated: { type: 'number' },
				totalSkipped: {
					type: 'number',
					description:
						'Number of drivers skipped due to duplicate emails',
				},
				duplicateEmails: {
					type: 'array',
					items: { type: 'number' },
					description: 'Array of driver IDs with duplicate emails',
				},
				isComplete: { type: 'boolean' },
			},
			example: {
				status: 'processing',
				progress: 45.5,
				processedPages: 15,
				totalImported: 450,
				totalUpdated: 25,
				totalSkipped: 8,
				duplicateEmails: [
					3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110,
				],
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
		summary:
			'Start background import of users from external TMS API (No auth required)',
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
				message:
					'Background import process started. Job ID: import-users-1695998400000. Check status at /v1/users/import-users-status/import-users-1695998400000',
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
		description:
			'Returns the current status and progress of an import users job',
	})
	@ApiResponse({
		status: 200,
		description: 'Import status retrieved successfully',
		schema: {
			type: 'object',
			properties: {
				status: {
					type: 'string',
					enum: ['processing', 'completed', 'failed'],
				},
				progress: {
					type: 'number',
					description: 'Progress percentage',
				},
				processedPages: { type: 'number' },
				totalImported: { type: 'number' },
				totalUpdated: { type: 'number' },
				totalSkipped: {
					type: 'number',
					description:
						'Number of users skipped due to duplicate emails',
				},
				duplicateEmails: {
					type: 'array',
					items: { type: 'number' },
					description: 'Array of user IDs with duplicate emails',
				},
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

	@Put(':id/location')
	@ApiOperation({
		summary: 'Update user location and coordinates',
		description:
			'Updates location-related fields (location, city, state, zip, latitude, longitude) for given user. Intended for mobile location tracking.',
	})
	@ApiResponse({
		status: 200,
		description: 'User location updated successfully',
	})
	async updateUserLocation(
		@Param('id') id: string,
		@Body() body: UpdateUserLocationDto,
	) {
		return this.usersService.updateUserLocation(id, body);
	}

	@Get('drivers/map')
	@ApiOperation({
		summary: 'Get drivers for map display with pagination',
		description:
			'Returns paginated list of drivers with valid coordinates and active status. Excludes drivers with banned, blocked, or expired_documents status.',
	})
	@ApiQuery({
		name: 'page',
		required: false,
		description: 'Page number for pagination',
		type: Number,
		example: 1,
	})
	@ApiQuery({
		name: 'limit',
		required: false,
		description: 'Number of drivers per page',
		type: Number,
		example: 100,
	})
	@ApiResponse({
		status: 200,
		description: 'Drivers retrieved successfully',
		schema: {
			type: 'object',
			properties: {
				drivers: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								description: 'Unique user identifier',
							},
							externalId: {
								type: 'string',
								description: 'External system ID',
							},
							latitude: {
								type: 'number',
								description: 'Driver latitude coordinate',
							},
							longitude: {
								type: 'number',
								description: 'Driver longitude coordinate',
							},
							driverStatus: {
								type: 'string',
								description: 'Driver status',
							},
						},
					},
				},
				pagination: {
					type: 'object',
					properties: {
						current_page: {
							type: 'number',
						},
						per_page: {
							type: 'number',
						},
						total_count: {
							type: 'number',
						},
						total_pages: {
							type: 'number',
						},
						has_next_page: {
							type: 'boolean',
						},
						has_prev_page: {
							type: 'boolean',
						},
					},
				},
			},
		},
	})
	async getDriversForMap(
		@Query('page') page?: number,
		@Query('limit') limit?: number,
	) {
		const pageNum = page ? Number(page) : 1;
		const limitNum = limit ? Number(limit) : 100;
		return this.usersService.findDriversForMap(pageNum, limitNum);
	}

	@Get()
	@ApiOperation({
		summary: 'Get all users with pagination and filtering',
		description:
			'Returns a paginated list of users with optional filtering by role, status, and search. Supports sorting by any user field.',
	})
	@ApiQuery({
		name: 'page',
		required: false,
		description: 'Page number for pagination',
		type: Number,
		example: 1,
	})
	@ApiQuery({
		name: 'limit',
		required: false,
		description: 'Number of users per page',
		type: Number,
		example: 10,
	})
	@ApiQuery({
		name: 'role',
		required: false,
		description: 'Filter users by role',
		enum: [
			'DRIVER_UPDATES',
			'MODERATOR',
			'RECRUITER',
			'ADMINISTRATOR',
			'NIGHTSHIFT_TRACKING',
			'DISPATCHER',
			'BILLING',
			'SUBSCRIBER',
			'ACCOUNTING',
			'RECRUITER_TL',
			'TRACKING',
			'DISPATCHER_TL',
			'TRACKING_TL',
			'MORNING_TRACKING',
			'EXPEDITE_MANAGER',
			'DRIVER',
		],
		example: 'ADMINISTRATOR',
	})
	@ApiQuery({
		name: 'status',
		required: false,
		description: 'Filter users by status',
		enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'],
		example: 'ACTIVE',
	})
	@ApiQuery({
		name: 'search',
		required: false,
		description: 'Search users by first name, last name, email, or phone',
		type: String,
		example: 'john',
	})
	@ApiQuery({
		name: 'sort',
		required: false,
		description: 'Sort users by field (JSON format: {"field": "asc|desc"})',
		type: String,
		example: '{"firstName": "asc"}',
	})
	@ApiResponse({
		status: 200,
		description: 'Users retrieved successfully',
		schema: {
			type: 'object',
			properties: {
				users: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								description: 'Unique user identifier',
							},
							externalId: {
								type: 'string',
								description:
									'External system ID for imported users',
							},
							firstName: {
								type: 'string',
								description: 'User first name',
							},
							lastName: {
								type: 'string',
								description: 'User last name',
							},
							email: {
								type: 'string',
								description: 'User email address',
							},
							phone: {
								type: 'string',
								description: 'User phone number',
							},
							location: {
								type: 'string',
								description: 'User location',
							},
							type: {
								type: 'string',
								description: 'Vehicle type',
							},
							vin: {
								type: 'string',
								description: 'Vehicle VIN number',
							},
							avatar: {
								type: 'string',
								description: 'User avatar URL',
							},
							role: {
								type: 'string',
								enum: [
									'DRIVER_UPDATES',
									'MODERATOR',
									'RECRUITER',
									'ADMINISTRATOR',
									'NIGHTSHIFT_TRACKING',
									'DISPATCHER',
									'BILLING',
									'SUBSCRIBER',
									'ACCOUNTING',
									'RECRUITER_TL',
									'TRACKING',
									'DISPATCHER_TL',
									'TRACKING_TL',
									'MORNING_TRACKING',
									'EXPEDITE_MANAGER',
									'DRIVER',
								],
								description: 'User role',
							},
							status: {
								type: 'string',
								enum: [
									'ACTIVE',
									'INACTIVE',
									'SUSPENDED',
									'PENDING',
								],
								description: 'User status',
							},
							createdAt: {
								type: 'string',
								format: 'date-time',
								description: 'Creation timestamp',
							},
							updatedAt: {
								type: 'string',
								format: 'date-time',
								description: 'Last update timestamp',
							},
						},
					},
				},
				pagination: {
					type: 'object',
					properties: {
						current_page: {
							type: 'number',
							description: 'Current page number',
						},
						per_page: {
							type: 'number',
							description: 'Items per page',
						},
						total_count: {
							type: 'number',
							description: 'Total number of users',
						},
						total_pages: {
							type: 'number',
							description: 'Total number of pages',
						},
						has_next_page: {
							type: 'boolean',
							description: 'Whether there is a next page',
						},
						has_prev_page: {
							type: 'boolean',
							description: 'Whether there is a previous page',
						},
					},
				},
				timestamp: {
					type: 'string',
					format: 'date-time',
					description: 'Response timestamp',
				},
				path: { type: 'string', description: 'API path' },
			},
		},
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

	@Get('external/:externalId/public')
	@SkipAuth()
	@ApiOperation({
		summary: 'Get user by external ID (Public)',
		description:
			'Public endpoint to get driver information for tracking page. No authentication required.',
	})
	@ApiResponse({
		status: 200,
		description: 'User retrieved successfully',
	})
	@ApiResponse({ status: 404, description: 'User not found' })
	async findUserByExternalIdPublic(@Param('externalId') externalId: string) {
		console.log(
			'🔓 [Public Endpoint] Request received for externalId:',
			externalId,
		);
		const user = await this.usersService.findUserByExternalId(externalId);
		console.log('🔓 [Public Endpoint] User found:', {
			firstName: user.firstName,
			lastName: user.lastName,
			phone: user.phone,
			latitude: user.latitude,
			longitude: user.longitude,
		});
		return user;
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

	@Get(':id/driver-status')
	@ApiOperation({ summary: 'Get driver status by user ID' })
	@ApiResponse({
		status: 200,
		description: 'Driver status retrieved successfully',
		schema: {
			type: 'object',
			properties: {
				driverStatus: {
					type: 'string',
					nullable: true,
					description: 'Driver status value',
				},
			},
		},
	})
	@ApiResponse({ status: 404, description: 'User not found' })
	@ApiResponse({ status: 400, description: 'User is not a driver' })
	async getDriverStatus(@Param('id') id: string) {
		return this.usersService.getDriverStatus(id);
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
