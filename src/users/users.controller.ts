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
	ForbiddenException,
	BadRequestException,
	HttpCode,
	HttpStatus,
	Request,
	Req,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
import { decodeBearerJwtPayload } from '../auth/utils/decode-bearer-jwt.util';
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
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetDriverPasswordDto } from './dto/set-driver-password.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { ImportDriversService } from './services/import-drivers.service';
import { ImportDriversBackgroundService } from './services/import-drivers-background.service';
import { ImportUsersService } from './services/import-users.service';
import { ImportUsersBackgroundService } from './services/import-users-background.service';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../types/request.types';

/** Non-admin users may only PATCH these fields on their own record via PUT :id. */
const SELF_USER_UPDATE_FIELDS: (keyof UpdateUserDto)[] = [
	'profilePhoto',
	'firstName',
	'lastName',
	'phone',
	'location',
	'state',
	'zip',
	'city',
	'driverStatus',
	'statusDate',
];

function pickSelfServiceUserUpdate(dto: UpdateUserDto): UpdateUserDto {
	const out: UpdateUserDto = {};
	for (const key of SELF_USER_UPDATE_FIELDS) {
		if (dto[key] !== undefined) {
			(out as Record<string, unknown>)[key] = dto[key];
		}
	}
	return out;
}

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
	@SkipAuth()
	@ApiOperation({
		summary: 'Update user location and coordinates',
		description:
			'Updates location-related fields (location, city, state, zip, latitude, longitude) for given user. Intended for mobile location tracking. Auth is not validated; user id is taken from JWT `sub` when Bearer token is present, otherwise from `:id`.',
	})
	@ApiResponse({
		status: 200,
		description: 'User location updated successfully (and TMS synced for drivers)',
	})
	@ApiResponse({
		status: 503,
		description:
			'Database updated but TMS sync failed — body includes databaseUpdated, tmsError, user',
	})
	async updateUserLocation(
		@Param('id') id: string,
		@Body() body: UpdateUserLocationDto,
		@Req() req: ExpressRequest,
	) {
		const tokenPayload = decodeBearerJwtPayload(req.headers.authorization);
		const userId = tokenPayload?.sub?.trim() || id;
		return this.usersService.updateUserLocation(userId, body, {
			urlParamUserId: id,
			tokenSub: tokenPayload?.sub ?? null,
		});
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
		@Query('company') company?: string,
	) {
		const pageNum = page ? Number(page) : 1;
		const limitNum = limit ? Number(limit) : 100;
		return this.usersService.findDriversForMap(pageNum, limitNum, company);
	}

	@Get('drivers/check-list')
	@ApiOperation({
		summary: 'Drivers check list (stale location)',
		description:
			'ACTIVE drivers with loaded_enroute and/or available (filterable), excluding deactivateAccount true, banned, blocked, expired_documents, and on_vocation. Last location update (NY wall time string) older than 3 hours. Sortable by last location via lastLocationSort (asc | desc), secondary sort by id.',
	})
	@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
	@ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
	@ApiQuery({
		name: 'driverStatus',
		required: false,
		enum: ['all', 'available', 'loaded_enroute'],
		description: 'Filter by driver workflow status (default: all).',
	})
	@ApiQuery({
		name: 'search',
		required: false,
		description:
			'Filter by first name, last name, email, externalId (driver ID), or tracking load id (substring, case-insensitive).',
	})
	@ApiQuery({
		name: 'lastLocationSort',
		required: false,
		enum: ['asc', 'desc'],
		description:
			'Sort by last location update: asc = oldest first (default), desc = newest first among stale rows.',
	})
	async getDriversCheckList(
		@Query('page') page?: number,
		@Query('limit') limit?: number,
		@Query('driverStatus') driverStatus?: string,
		@Query('search') search?: string,
		@Query('lastLocationSort') lastLocationSort?: string,
	) {
		const pageNum = page ? Number(page) : 1;
		const limitNum = limit ? Number(limit) : 10;
		const raw = (driverStatus ?? 'all').trim().toLowerCase();
		const filter: 'all' | 'available' | 'loaded_enroute' =
			raw === 'available'
				? 'available'
				: raw === 'loaded_enroute'
					? 'loaded_enroute'
					: 'all';
		const sortRaw = (lastLocationSort ?? 'asc').trim().toLowerCase();
		const locationSort: 'asc' | 'desc' = sortRaw === 'desc' ? 'desc' : 'asc';
		return this.usersService.findDriversCheckList(
			pageNum,
			limitNum,
			filter,
			search,
			locationSort,
		);
	}

	@Get('drivers/check-list/version')
	@ApiOperation({
		summary: 'Drivers check list (outdated app version)',
		description:
			'ACTIVE drivers (deactivateAccount not true, not banned, blocked, expired_documents, or on_vocation) with at least one outdated app version. Returns all devices per matching driver. Search matches name, email, externalId (no load id). Default sort: lowest app version first (appVersionSort asc | desc).',
	})
	@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
	@ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
	@ApiQuery({
		name: 'search',
		required: false,
		description:
			'Filter by first name, last name, email, or externalId (driver ID). Substring, case-insensitive.',
	})
	@ApiQuery({
		name: 'appVersionSort',
		required: false,
		enum: ['asc', 'desc'],
		description:
			'Sort by lowest app version on the account: asc = oldest first (default), desc = newest first.',
	})
	async getDriversCheckListVersion(
		@Query('page') page?: number,
		@Query('limit') limit?: number,
		@Query('search') search?: string,
		@Query('appVersionSort') appVersionSort?: string,
	) {
		const pageNum = page ? Number(page) : 1;
		const limitNum = limit ? Number(limit) : 10;
		const sortRaw = (appVersionSort ?? 'asc').trim().toLowerCase();
		const versionSort: 'asc' | 'desc' = sortRaw === 'desc' ? 'desc' : 'asc';
		return this.usersService.findDriversCheckListVersion(
			pageNum,
			limitNum,
			search,
			versionSort,
		);
	}

	@Get('drivers/check-list/several-devices')
	@ApiOperation({
		summary: 'Drivers check list (multiple devices)',
		description:
			'ACTIVE drivers (deactivateAccount not true, not banned, blocked, expired_documents, or on_vocation) with two or more devices on one account. Returns all devices per matching driver. Search matches name, email, externalId (no load id). Default sort: lowest app version first (appVersionSort asc | desc).',
	})
	@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
	@ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
	@ApiQuery({
		name: 'search',
		required: false,
		description:
			'Filter by first name, last name, email, or externalId (driver ID). Substring, case-insensitive.',
	})
	@ApiQuery({
		name: 'appVersionSort',
		required: false,
		enum: ['asc', 'desc'],
		description:
			'Sort by lowest app version on the account: asc = oldest first (default), desc = newest first.',
	})
	async getDriversCheckListSeveralDevices(
		@Query('page') page?: number,
		@Query('limit') limit?: number,
		@Query('search') search?: string,
		@Query('appVersionSort') appVersionSort?: string,
	) {
		const pageNum = page ? Number(page) : 1;
		const limitNum = limit ? Number(limit) : 10;
		const sortRaw = (appVersionSort ?? 'asc').trim().toLowerCase();
		const versionSort: 'asc' | 'desc' = sortRaw === 'desc' ? 'desc' : 'asc';
		return this.usersService.findDriversCheckListSeveralDevices(
			pageNum,
			limitNum,
			search,
			versionSort,
		);
	}

	@Post('drivers/set-password')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Set driver password and OTP manually (Admin / Recruiter TL)',
		description:
			'Sets bcrypt-hashed password and a numeric OTP for the driver identified by externalId. OTP is valid for 24 hours.',
	})
	@ApiResponse({ status: 200, description: 'Password and OTP set successfully' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'Driver not found' })
	async setDriverPassword(
		@Body() dto: SetDriverPasswordDto,
		@Request() req: AuthenticatedRequest,
	): Promise<{ message: string }> {
		const role = req.user.role;
		if (role !== UserRole.ADMINISTRATOR && role !== UserRole.RECRUITER_TL) {
			throw new ForbiddenException(
				'You are not allowed to set driver password and OTP',
			);
		}

		return this.usersService.setDriverPasswordAndOtp(
			dto.externalId,
			dto.password,
			dto.otp,
		);
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
		name: 'roles',
		required: false,
		description:
			'Filter users by roles (comma-separated list or single role). Example: "ADMINISTRATOR" or "RECRUITER,RECRUITER_TL,ADMINISTRATOR"',
		type: String,
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
		name: 'contactsOnly',
		required: false,
		description:
			'When true, returns only users with status ACTIVE (used for contact lists).',
		type: Boolean,
		example: true,
	})
	@ApiQuery({
		name: 'hasUserDevice',
		required: false,
		description:
			'When true, returns only users who have at least one row in user_devices (mobile device snapshot).',
		type: Boolean,
		example: true,
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
									'HR_MANAGER',
									'TRACKING',
									'DISPATCHER_TL',
									'TRACKING_TL',
									'MORNING_TRACKING',
									'EXPEDITE_MANAGER',
									'DRIVER',
									'GAST',
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
		@Query('roles') roles?: string,
		@Query('status') status?: UserStatus,
		@Query('contactsOnly') contactsOnly?: string,
		@Query('hasUserDevice') hasUserDevice?: string,
		@Query('search') search?: string,
		@Query('sort') sort?: string,
		@Query('company') company?: string,
	) {
		// Parse roles from comma-separated string to array
		let rolesArray: UserRole[] | undefined;
		if (roles) {
			const roleStrings = roles
				.split(',')
				.map((r) => r.trim())
				.filter((r) => r);
			rolesArray = roleStrings.filter((r): r is UserRole =>
				Object.values(UserRole).includes(r as UserRole),
			);
			if (rolesArray.length === 0) {
				rolesArray = undefined;
			}
		}

		let sortObj: { [key: string]: 'asc' | 'desc' } | undefined;

		if (sort) {
			try {
				sortObj = JSON.parse(sort) as { [key: string]: 'asc' | 'desc' };
			} catch {
				// If sort parameter is invalid, use default sorting
				sortObj = { createdAt: 'desc' };
			}
		}

		// contactsOnly mode: show only users who actually use the app (status ACTIVE)
		const contactsOnlyEnabled =
			contactsOnly === 'true' || contactsOnly === '1';
		const effectiveStatus = contactsOnlyEnabled ? UserStatus.ACTIVE : status;

		const hasUserDeviceEnabled =
			hasUserDevice === 'true' || hasUserDevice === '1';

		return this.usersService.findAllUsers(
			page ? parseInt(page, 10) : 1,
			limit ? parseInt(limit, 10) : 10,
			rolesArray,
			effectiveStatus,
			search,
			sortObj,
			company,
			hasUserDeviceEnabled,
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
		const user = await this.usersService.findUserByExternalId(externalId, {
			includeTmsLoadRouteLocations: true,
		});
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

	@Get(':id/notification-preferences')
	@ApiOperation({
		summary: 'Get message push notification preference for user',
	})
	@ApiResponse({ status: 200, description: 'Preference retrieved' })
	async getNotificationPreferences(
		@Param('id') id: string,
		@Request() req: AuthenticatedRequest,
	) {
		if (req.user.role !== UserRole.ADMINISTRATOR && req.user.id !== id) {
			throw new ForbiddenException(
				'You are not allowed to read this user preference',
			);
		}
		return this.usersService.getNotificationPreferences(id);
	}

	@Put(':id/notification-preferences')
	@ApiOperation({
		summary: 'Update message push notification preference (self or admin)',
	})
	@ApiResponse({ status: 200, description: 'Preference updated' })
	async updateNotificationPreferences(
		@Param('id') id: string,
		@Body() dto: UpdateNotificationPreferencesDto,
		@Request() req: AuthenticatedRequest,
	) {
		if (req.user.role !== UserRole.ADMINISTRATOR && req.user.id !== id) {
			throw new ForbiddenException(
				'You are not allowed to update this user preference',
			);
		}
		return this.usersService.updateNotificationPreferences(
			id,
			dto.notificationsEnabled,
		);
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
				deactivateAccount: {
					type: 'boolean',
					description: 'TMS soft-remove flag (account deactivated)',
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
	@ApiOperation({ summary: 'Update user (self or Administrator)' })
	@ApiResponse({
		status: 200,
		description: 'User updated successfully',
	})
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'User not found' })
	async updateUser(
		@Param('id') id: string,
		@Body() updateUserDto: UpdateUserDto,
		@Request() req: AuthenticatedRequest,
	) {
		const isAdmin = req.user.role === UserRole.ADMINISTRATOR;
		if (!isAdmin && req.user.id !== id) {
			throw new ForbiddenException('You are not allowed to update this user');
		}

		let body: UpdateUserDto = isAdmin
			? { ...updateUserDto }
			: pickSelfServiceUserUpdate(updateUserDto);

		// Non-admins may only set profilePhoto on their own record.
		if (req.user.id !== id && !isAdmin) {
			delete body.profilePhoto;
		}

		const hasField = Object.values(body).some((v) => v !== undefined);
		if (!hasField) {
			throw new BadRequestException('No permitted fields to update');
		}

		return this.usersService.updateUser(id, body);
	}

	@Put(':id/password')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Change user password (Self or Admin)' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				newPassword: { type: 'string', example: 'MyNewPassword1' },
			},
			required: ['newPassword'],
		},
	})
	@ApiResponse({ status: 200, description: 'Password changed successfully' })
	@ApiResponse({ status: 403, description: 'Forbidden' })
	@ApiResponse({ status: 404, description: 'User not found' })
	async changePassword(
		@Param('id') id: string,
		@Body() dto: ChangePasswordDto,
		@Request() req: AuthenticatedRequest,
	): Promise<{ message: string }> {
		const canChange =
			req.user.id === id || req.user.role === UserRole.ADMINISTRATOR;
		if (!canChange) {
			throw new ForbiddenException('You are not allowed to change this password');
		}

		await this.usersService.changePassword(id, dto.newPassword);
		return { message: 'Password changed successfully' };
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
