import {
	Controller,
	Get,
	Put,
	Delete,
	Body,
	Param,
	Query,
	UseGuards,
} from '@nestjs/common';
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
import { UserRole, UserStatus } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

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
