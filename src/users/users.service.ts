import {
	Injectable,
	NotFoundException,
	BadRequestException,
	ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import {
	WebhookSyncDto,
	WebhookType,
	WebhookRole,
	DriverData,
	UserData,
} from './dto/webhook-sync.dto';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Finds all users with pagination and filtering
	 */
	async findAllUsers(
		page: number = 1,
		limit: number = 10,
		role?: UserRole,
		status?: UserStatus,
		search?: string,
		sort?: { [key: string]: 'asc' | 'desc' },
	) {
		const skip = (page - 1) * limit;

		const where: Record<string, unknown> = {};

		if (role) {
			where.role = role;
		}

		if (status) {
			where.status = status;
		}

		if (search) {
			where.OR = [
				{ firstName: { contains: search, mode: 'insensitive' } },
				{ lastName: { contains: search, mode: 'insensitive' } },
				{ email: { contains: search, mode: 'insensitive' } },
				{ phone: { contains: search, mode: 'insensitive' } },
			];
		}

		const [users, total] = await Promise.all([
			this.prisma.user.findMany({
				where,
				skip,
				take: limit,
				orderBy: sort || { createdAt: 'desc' },
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					location: true,
					type: true,
					vin: true,
					profilePhoto: true,
					role: true,
					status: true,
					createdAt: true,
					updatedAt: true,
				},
			}),
			this.prisma.user.count({ where }),
		]);

		// Transform users to match frontend format
		const transformedUsers = users.map((user) => ({
			id: user.id,
			externalId: user.externalId,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			phone: user.phone || '',
			location: user.location || '',
			type: user.type || '',
			vin: user.vin || '',
			avatar: user.profilePhoto, // Map profilePhoto to avatar
			role: user.role,
			status: user.status,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		}));

		return {
			users: transformedUsers,
			pagination: {
				current_page: page,
				per_page: limit,
				total_count: total,
				total_pages: Math.ceil(total / limit),
				has_next_page: page < Math.ceil(total / limit),
				has_prev_page: page > 1,
			},
			timestamp: new Date().toISOString(),
			path: '/v1/users',
		};
	}

	/**
	 * Finds user by ID
	 */
	async findUserById(id: string) {
		const user = await this.prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				externalId: true,
				email: true,
				firstName: true,
				lastName: true,
				phone: true,
				profilePhoto: true,
				location: true,
				state: true,
				zip: true,
				city: true,
				role: true,
				status: true,
				createdAt: true,
				updatedAt: true,
				lastLoginAt: true,
			},
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		// Transform user to match frontend format
		return {
			...user,
			avatar: user.profilePhoto, // Map profilePhoto to avatar
		};
	}

	/**
	 * Finds user by external ID
	 */
	async findUserByExternalId(externalId: string) {
		const user = await this.prisma.user.findUnique({
			where: { externalId },
			select: {
				id: true,
				externalId: true,
				email: true,
				firstName: true,
				lastName: true,
				phone: true,
				profilePhoto: true,
				location: true,
				state: true,
				zip: true,
				city: true,
				role: true,
				status: true,
				createdAt: true,
				updatedAt: true,
				lastLoginAt: true,
			},
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		return user;
	}

	/**
	 * Updates user (admin only)
	 */
	async updateUser(id: string, updateUserDto: UpdateUserDto) {
		const user = await this.prisma.user.findUnique({
			where: { id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		// Hash password if provided
		if (updateUserDto.password) {
			updateUserDto.password = await bcrypt.hash(
				updateUserDto.password,
				12,
			);
		}

		const updatedUser = await this.prisma.user.update({
			where: { id },
			data: updateUserDto,
			select: {
				id: true,
				externalId: true,
				email: true,
				firstName: true,
				lastName: true,
				phone: true,
				profilePhoto: true,
				location: true,
				state: true,
				zip: true,
				city: true,
				role: true,
				status: true,
				createdAt: true,
				updatedAt: true,
				lastLoginAt: true,
			},
		});

		return updatedUser;
	}

	/**
	 * Deletes user (admin only)
	 */
	async deleteUser(id: string) {
		const user = await this.prisma.user.findUnique({
			where: { id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		await this.prisma.user.delete({
			where: { id },
		});

		return { message: 'User deleted successfully' };
	}

	/**
	 * Changes user status (admin only)
	 */
	async changeUserStatus(id: string, status: UserStatus) {
		const user = await this.prisma.user.findUnique({
			where: { id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		const updatedUser = await this.prisma.user.update({
			where: { id },
			data: { status },
			select: {
				id: true,
				externalId: true,
				email: true,
				firstName: true,
				lastName: true,
				role: true,
				status: true,
			},
		});

		return updatedUser;
	}

	/**
	 * Processes webhook sync data from TMS
	 * Handles add, update, and delete operations for drivers and employees
	 */
	async processWebhookSync(webhookData: WebhookSyncDto) {
		const { type, role, driver_data, user_data, driver_id, user_id } =
			webhookData;

		try {
			if (role === WebhookRole.DRIVER) {
				return await this.processDriverWebhook(
					type,
					driver_data,
					driver_id,
				);
			} else {
				return await this.processEmployeeWebhook(
					type,
					user_data,
					user_id,
				);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			throw new BadRequestException(
				`Failed to process webhook: ${errorMessage}`,
			);
		}
	}

	/**
	 * Processes driver webhook data
	 */
	private async processDriverWebhook(
		type: WebhookType,
		driverData?: DriverData,
		driverId?: string,
	) {
		if (type === WebhookType.DELETE) {
			if (!driverId) {
				throw new BadRequestException(
					'Driver ID is required for delete operation',
				);
			}

			const user = await this.prisma.user.findFirst({
				where: { externalId: driverId },
			});

			if (!user) {
				throw new NotFoundException('Driver not found');
			}

			await this.prisma.user.delete({
				where: { id: user.id },
			});

			return {
				action: 'deleted',
				externalId: driverId,
				message: 'Driver deleted successfully',
			};
		}

		if (!driverData) {
			throw new BadRequestException(
				'Driver data is required for add/update operations',
			);
		}

		const {
			driver_id,
			driver_name,
			driver_email,
			driver_phone,
			home_location,
		} = driverData;

		// Parse driver name
		const nameParts = driver_name?.split(' ') || [];
		const firstName = nameParts[0] || '';
		const lastName = nameParts.slice(1).join(' ') || '';

		// Map TMS role to our UserRole
		const mappedRole = UserRole.DRIVER;

		const userData = {
			externalId: driver_id,
			email: driver_email,
			firstName,
			lastName,
			phone: driver_phone,
			location: home_location,
			role: mappedRole,
		};

		if (type === WebhookType.ADD) {
			// Check if user already exists
			const existingUser = await this.prisma.user.findFirst({
				where: {
					OR: [{ externalId: driver_id }, { email: driver_email }],
				},
			});

			if (existingUser) {
				throw new ConflictException('Driver already exists');
			}

			const newUser = await this.prisma.user.create({
				data: {
					...userData,
					password: '', // Will be set when user first logs in
				},
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					profilePhoto: true,
					location: true,
					state: true,
					zip: true,
					city: true,
					role: true,
					status: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return {
				action: 'created',
				user: newUser,
			};
		} else if (type === WebhookType.UPDATE) {
			// Find user by externalId
			const existingUser = await this.prisma.user.findFirst({
				where: { externalId: driver_id },
			});

			if (!existingUser) {
				throw new NotFoundException('Driver not found');
			}

			const updatedUser = await this.prisma.user.update({
				where: { id: existingUser.id },
				data: userData,
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					profilePhoto: true,
					location: true,
					state: true,
					zip: true,
					city: true,
					role: true,
					status: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return {
				action: 'updated',
				user: updatedUser,
			};
		}
	}

	/**
	 * Processes employee webhook data
	 */
	private async processEmployeeWebhook(
		type: WebhookType,
		userData?: UserData,
		userId?: number,
	) {
		if (type === WebhookType.DELETE) {
			if (!userId) {
				throw new BadRequestException(
					'User ID is required for delete operation',
				);
			}

			const user = await this.prisma.user.findFirst({
				where: { externalId: userId.toString() },
			});

			if (!user) {
				throw new NotFoundException('Employee not found');
			}

			await this.prisma.user.delete({
				where: { id: user.id },
			});

			return {
				action: 'deleted',
				externalId: userId.toString(),
				message: 'Employee deleted successfully',
			};
		}

		if (!userData) {
			throw new BadRequestException(
				'User data is required for add/update operations',
			);
		}

		const { id, user_email, first_name, last_name, roles, acf_fields } =
			userData;

		// Map TMS roles to our UserRole
		let mappedRole: UserRole = UserRole.DRIVER; // Default
		if (roles && Array.isArray(roles) && roles.length > 0) {
			const role = String(roles[0]).toLowerCase();
			switch (role) {
				case 'dispatcher':
					mappedRole = UserRole.DISPATCHER;
					break;
				case 'admin':
					mappedRole = UserRole.ADMINISTRATOR;
					break;
				case 'manager':
					mappedRole = UserRole.EXPEDITE_MANAGER;
					break;
				default:
					mappedRole = UserRole.DRIVER;
			}
		}

		// Determine user status based on deactivate_account flag
		const userStatus =
			acf_fields?.deactivate_account === true
				? UserStatus.INACTIVE
				: UserStatus.ACTIVE;

		const employeeData = {
			externalId: String(id),
			email: user_email,
			firstName: first_name,
			lastName: last_name,
			phone: acf_fields?.phone_number || undefined,
			location: acf_fields?.work_location || undefined,
			role: mappedRole,
			status: userStatus,
			deactivateAccount: acf_fields?.deactivate_account || false,
		};

		if (type === WebhookType.ADD) {
			// Check if user already exists
			const existingUser = await this.prisma.user.findFirst({
				where: {
					OR: [{ externalId: String(id) }, { email: user_email }],
				},
			});

			if (existingUser) {
				throw new ConflictException('Employee already exists');
			}

			const newUser = await this.prisma.user.create({
				data: {
					...employeeData,
					password: '', // Will be set when user first logs in
				},
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					profilePhoto: true,
					location: true,
					state: true,
					zip: true,
					city: true,
					role: true,
					status: true,
					deactivateAccount: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return {
				action: 'created',
				user: newUser,
			};
		} else if (type === WebhookType.UPDATE) {
			// Find user by externalId
			const existingUser = await this.prisma.user.findFirst({
				where: { externalId: String(id) },
			});

			if (!existingUser) {
				throw new NotFoundException('Employee not found');
			}

			const updatedUser = await this.prisma.user.update({
				where: { id: existingUser.id },
				data: employeeData,
				select: {
					id: true,
					externalId: true,
					email: true,
					firstName: true,
					lastName: true,
					phone: true,
					profilePhoto: true,
					location: true,
					state: true,
					zip: true,
					city: true,
					role: true,
					status: true,
					deactivateAccount: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return {
				action: 'updated',
				user: updatedUser,
			};
		}
	}
}
