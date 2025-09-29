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
import { AuthGuard } from '@nestjs/passport';

import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ImportDriversDto } from './dto/import-drivers.dto';
import { ImportDriversService } from './services/import-drivers.service';
import { UserRole, UserStatus } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
	constructor(
		private readonly usersService: UsersService,
		private readonly importDriversService: ImportDriversService,
	) {}

	@Post('import-drivers')
	@SkipAuth()
	@ApiOperation({
		summary: 'Import drivers from external TMS API (No auth required)',
		description: `Imports drivers from external TMS API and returns import statistics. 
		
**Process:**
1. Makes GET request to: https://www.endurance-tms.com/wp-json/tms/v1/users?page={page}&per_page={per_page}&search={search}
2. Receives response with structure:
   - success: boolean
   - data: array of driver objects
   - pagination: {current_page, per_page, total_count, total_pages, has_next_page, has_prev_page}
   - filters: {status, search}
   - timestamp, api_version
3. Processes drivers and imports/updates them in our database
4. Returns import statistics

**Limitations:** Processes up to 5 pages per request to prevent timeouts.`,
	})
	@ApiResponse({
		status: 200,
		description: 'Drivers imported successfully - returns import statistics (not the raw external API data)',
		schema: {
			type: 'object',
			properties: {
				message: { type: 'string' },
				totalImported: { type: 'number' },
				totalUpdated: { type: 'number' },
				totalPages: { type: 'number' },
				pagesProcessed: { type: 'number' },
				hasMorePages: { type: 'boolean' },
			},
			example: {
				message: 'Import session completed. Imported: 25, Updated: 5, Pages processed: 5. More pages available.',
				totalImported: 25,
				totalUpdated: 5,
				totalPages: 38,
				pagesProcessed: 5,
				hasMorePages: true
			}
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Import failed',
	})
	async importDrivers(@Body() importDriversDto: ImportDriversDto) {
		return this.importDriversService.importDrivers(
			importDriversDto.page,
			importDriversDto.per_page,
			importDriversDto.search,
		);
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
