import {
	Injectable,
	NotFoundException,
	BadRequestException,
	ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import {
	WebhookSyncDto,
	WebhookType,
	WebhookRole,
} from './dto/webhook-sync.dto';
import { UserRole, UserStatus } from '@prisma/client';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';

@Injectable()
export class UsersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly notificationsWebSocketService: NotificationsWebSocketService,
	) {}

	/**
	 * Finds all users with pagination and filtering
	 */
	async findAllUsers(
		page: number = 1,
		limit: number = 10,
		roles?: UserRole[],
		status?: UserStatus,
		search?: string,
		sort?: { [key: string]: 'asc' | 'desc' },
	) {
		const skip = (page - 1) * limit;

		const where: Record<string, unknown> = {};

		if (roles && roles.length > 0) {
			where.role = { in: roles };
		}

		if (status) {
			where.status = status;
		}

		if (search) {
			where.OR = [
				{ firstName: { contains: search, mode: 'insensitive' } },
				{ lastName: { contains: search, mode: 'insensitive' } },
				{ email: { contains: search, mode: 'insensitive' } },
				{
					phone: {
						not: null,
						contains: search,
						mode: 'insensitive',
					},
				},
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
	 * Finds drivers for map display with pagination
	 * Returns only drivers with valid coordinates and active status
	 */
	async findDriversForMap(page: number = 1, limit: number = 100) {
		const skip = (page - 1) * limit;

		const where = {
			AND: [
				{ role: UserRole.DRIVER },
				{ driverStatus: { not: null } },
				{
					driverStatus: {
						notIn: ['banned', 'blocked', 'expired_documents'],
					},
				},
				{ latitude: { not: null } },
				{ longitude: { not: null } },
			],
		};

		const [drivers, total] = await Promise.all([
			this.prisma.user.findMany({
				where,
				skip,
				take: limit,
				orderBy: { updatedAt: 'desc' },
				select: {
					id: true,
					externalId: true,
					latitude: true,
					longitude: true,
					driverStatus: true,
				},
			}),
			this.prisma.user.count({ where }),
		]);

		return {
			drivers: drivers.map((driver) => ({
				id: driver.id,
				externalId: driver.externalId,
				latitude: driver.latitude,
				longitude: driver.longitude,
				driverStatus: driver.driverStatus,
			})),
			pagination: {
				current_page: page,
				per_page: limit,
				total_count: total,
				total_pages: Math.ceil(total / limit),
				has_next_page: page < Math.ceil(total / limit),
				has_prev_page: page > 1,
			},
		};
	}

	/**
	 * Gets driver status for a user by ID
	 * Returns only driverStatus field for DRIVER role users
	 */
	async getDriverStatus(id: string) {
		const user = await this.prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				role: true,
				driverStatus: true,
			},
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		// Only return driverStatus for DRIVER role users
		if (user.role !== UserRole.DRIVER) {
			throw new BadRequestException('User is not a driver');
		}

		return {
			driverStatus: user.driverStatus || null,
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
				latitude: true,
				longitude: true,
				lastLocationUpdateAt: true,
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
	 * Updates only user location-related fields (for mobile location tracking)
	 */
	async updateUserLocation(id: string, locationDto: UpdateUserLocationDto) {
		const user = await this.prisma.user.findUnique({
			where: { id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		const updatedUser = await this.prisma.user.update({
			where: { id },
			data: {
				location: locationDto.location,
				city: locationDto.city,
				state: locationDto.state,
				zip: locationDto.zip,
				latitude: locationDto.latitude,
				longitude: locationDto.longitude,
				// Store client local time string as-is (no timezone normalization)
				lastLocationUpdateAt: locationDto.lastLocationUpdateAt,
			},
			select: {
				id: true,
				externalId: true,
				email: true,
				firstName: true,
				lastName: true,
				location: true,
				city: true,
				state: true,
				zip: true,
				latitude: true,
				longitude: true,
				updatedAt: true,
				lastLocationUpdateAt: true,
			},
		});

		// Emit websocket event so Next.js/admin UI can react to location changes
		void this.notificationsWebSocketService.sendUserLocationUpdate(id, {
			userId: updatedUser.id,
			externalId: updatedUser.externalId,
			latitude: updatedUser.latitude,
			longitude: updatedUser.longitude,
			location: updatedUser.location,
			city: updatedUser.city,
			state: updatedUser.state,
			zip: updatedUser.zip,
			lastLocationUpdateAt: updatedUser.lastLocationUpdateAt,
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
		try {
			if (webhookData?.role === WebhookRole.DRIVER) {
				return await this.processDriverWebhook(webhookData);
			} else {
				return await this.processEmployeeWebhook(webhookData);
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
	private async processDriverWebhook(webhookData: WebhookSyncDto) {
		const { type, driver_data, driver_id } = webhookData;

		console.log('🚗 [Webhook Driver] Processing driver webhook update');
		console.log(`🚗 [Webhook Driver] Type: ${type}`);
		console.log(
			`🚗 [Webhook Driver] Driver ID: ${driver_id || driver_data?.driver_id || 'N/A'}`,
		);

		if (driver_data) {
			console.log('🚗 [Webhook Driver] Driver data received:');
			console.log(JSON.stringify(driver_data, null, 2));
		} else if (driver_id) {
			console.log(
				`🚗 [Webhook Driver] Delete operation for driver_id: ${driver_id}`,
			);
		}

		if (type === WebhookType.DELETE) {
			if (!driver_id) {
				throw new BadRequestException(
					'Driver ID is required for delete operation',
				);
			}

			const user = await this.prisma.user.findFirst({
				where: { externalId: driver_id },
			});

			if (!user) {
				throw new NotFoundException('Driver not found');
			}

			await this.prisma.user.delete({
				where: { id: user.id },
			});

			return {
				action: 'deleted',
				externalId: driver_id,
				message: 'Driver deleted successfully',
			};
		}

		if (!driver_data) {
			throw new BadRequestException(
				'Driver data is required for add/update operations',
			);
		}

		const {
			driver_id: driverId,
			driver_name,
			driver_email,
			driver_phone,
			home_location,
			vehicle_type,
			vin,
			driver_status,
			current_location,
			current_city,
			current_zipcode,
			latitude,
			longitude,
		} = driver_data;

		// Parse driver name
		const nameParts = driver_name?.split(' ') || [];
		const firstName = nameParts[0] || '';
		const lastName = nameParts.slice(1).join(' ') || '';

		// Map TMS role to our UserRole
		const mappedRole = UserRole.DRIVER;

		// Helper function to parse coordinates
		const parseCoordinate = (
			coord: number | string | undefined,
		): number | null => {
			if (coord === undefined || coord === null) return null;
			if (typeof coord === 'number') {
				return Number.isNaN(coord) ? null : coord;
			}
			if (typeof coord === 'string') {
				const parsed = parseFloat(coord);
				return Number.isNaN(parsed) ? null : parsed;
			}
			return null;
		};

		const userData = {
			externalId: driverId,
			email: driver_email,
			firstName,
			lastName,
			phone: driver_phone,
			location: current_location || home_location, // Use current_location if available, fallback to home_location
			city: current_city || null,
			zip: current_zipcode || null,
			role: mappedRole,
			vin,
			type: vehicle_type,
			driverStatus: driver_status || null,
			latitude: parseCoordinate(latitude),
			longitude: parseCoordinate(longitude),
			password: undefined, // Will be set when user first logs in
		};

		if (type === WebhookType.ADD) {
			// Check if user already exists
			const existingUser = await this.prisma.user.findFirst({
				where: {
					OR: [{ externalId: driverId }, { email: driver_email }],
				},
			});

			if (existingUser) {
				throw new ConflictException('Driver already exists');
			}

			const newUser = await this.prisma.user.create({
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				data: userData as any,
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
				where: { externalId: driverId },
			});

			if (!existingUser) {
				throw new NotFoundException('Driver not found');
			}

			// Check if driverStatus has changed
			const oldDriverStatus = existingUser.driverStatus;
			const newDriverStatus = driver_status || null;

			const updatedUser = await this.prisma.user.update({
				where: { id: existingUser.id },
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				data: userData as any,
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

			// Send WebSocket notification if driverStatus changed
			if (oldDriverStatus !== newDriverStatus) {
				await this.notificationsWebSocketService.sendDriverStatusUpdate(
					existingUser.id,
					newDriverStatus,
				);
			}

			return {
				action: 'updated',
				user: updatedUser,
			};
		}
	}

	/**
	 * Processes employee webhook data
	 */
	private async processEmployeeWebhook(webhookData: WebhookSyncDto) {
		const { type, user_data, user_id } = webhookData;

		if (type === WebhookType.DELETE) {
			if (!user_id) {
				throw new BadRequestException(
					'User ID is required for delete operation',
				);
			}

			const user = await this.prisma.user.findFirst({
				where: { externalId: user_id.toString() },
			});

			if (!user) {
				throw new NotFoundException('Employee not found');
			}

			await this.prisma.user.delete({
				where: { id: user.id },
			});

			return {
				action: 'deleted',
				externalId: user_id.toString(),
				message: 'Employee deleted successfully',
			};
		}

		if (!user_data) {
			throw new BadRequestException(
				'User data is required for add/update operations',
			);
		}

		const { id, user_email, first_name, last_name, roles, acf_fields } =
			user_data;

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
			role: String(roles[0]).toUpperCase(),
			status: userStatus,
			deactivateAccount: acf_fields?.deactivate_account || false,
			password: undefined, // Will be set when user first logs in
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
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				data: employeeData as any,
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
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				data: employeeData as any,
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
