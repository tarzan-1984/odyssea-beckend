import {
	Injectable,
	Logger,
	NotFoundException,
	BadRequestException,
	ConflictException,
	ForbiddenException,
	HttpException,
	HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import {
	WebhookSyncDto,
	WebhookType,
	WebhookRole,
} from './dto/webhook-sync.dto';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';
import { TmsDriverApplicationService } from '../tms/tms-driver-application.service';
import {
	buildTmsBatchLocationItem,
	TmsDriverLocationBatchService,
} from '../tms/tms-driver-location-batch.service';
import { formatTmsStatusDate } from '../tms/tms-status-date.util';
import type { ExternalApiConfig } from '../config/env.config';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsersService {
	private readonly logger = new Logger(UsersService.name);

	/** TMS webhook: enable auto location batch when driver enters these statuses. */
	private isAutoupdateForTmsDriverStatus(
		driverStatus: string | null | undefined,
	): boolean {
		if (driverStatus == null || typeof driverStatus !== 'string') {
			return false;
		}
		const n = driverStatus.trim().toLowerCase();
		return n === 'loaded_enroute' || n === 'available';
	}

	constructor(
		private readonly prisma: PrismaService,
		private readonly notificationsWebSocketService: NotificationsWebSocketService,
		private readonly notificationsService: NotificationsService,
		private readonly mailerService: MailerService,
		private readonly tmsDriverApplication: TmsDriverApplicationService,
		private readonly tmsDriverLocationBatch: TmsDriverLocationBatchService,
		private readonly configService: ConfigService,
		private readonly appSettingsService: AppSettingsService,
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
		company?: string,
	) {
		const skip = (page - 1) * limit;

		const where: Record<string, unknown> = {};

		if (roles && roles.length > 0) {
			where.role = { in: roles };
		}

		if (status) {
			where.status = status;
		}

		if (company) {
			const allowed = ['Odysseia', 'Martlet', 'Endurance'];
			if (!allowed.includes(company)) {
				throw new BadRequestException('Invalid company value');
			}
			// users.company is TEXT[] (Prisma String[])
			where.company = { has: company };
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
	async findDriversForMap(
		page: number = 1,
		limit: number = 100,
		company?: string,
	) {
		const skip = (page - 1) * limit;

		const and: any[] = [
			{ role: UserRole.DRIVER },
			{ driverStatus: { not: null } },
			{
				driverStatus: {
					notIn: ['banned', 'blocked', 'expired_documents'],
				},
			},
			{ latitude: { not: null } },
			{ longitude: { not: null } },
		];

		if (company) {
			const allowed = ['Odysseia', 'Martlet', 'Endurance'];
			if (!allowed.includes(company)) {
				throw new BadRequestException('Invalid company value');
			}
			and.push({ company: { has: company } });
		}

		const where = { AND: and };

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
					status: true,
					zip: true,
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
				status: driver.status,
				zip: driver.zip,
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
	 * Gets driver profile fields for mobile sync (DRIVER role only).
	 */
	async getDriverStatus(id: string) {
		const user = await this.prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				role: true,
				driverStatus: true,
				zip: true,
				city: true,
				state: true,
				location: true,
				statusDate: true,
				isAutoupdate: true,
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
			driverStatus: user.driverStatus ?? null,
			zip: user.zip ?? null,
			city: user.city ?? null,
			state: user.state ?? null,
			location: user.location ?? null,
			statusDate: user.statusDate ?? null,
			isAutoupdate: user.isAutoupdate ?? false,
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
				driverStatus: true,
				statusDate: true,
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
	 * Changes user password (self-service or admin)
	 */
	async changePassword(id: string, newPassword: string): Promise<void> {
		const user = await this.prisma.user.findUnique({
			where: { id },
			select: { id: true, email: true },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		const hashedPassword = await bcrypt.hash(newPassword, 12);

		await this.prisma.user.update({
			where: { id },
			data: { password: hashedPassword },
		});

		// Send email with new password (same template as reset-password-mobile)
		const emailSent = await this.mailerService.sendHtmlEmail(
			user.email,
			'Your New Password',
			`<div style="font-family: Arial, sans-serif; font-size: 16px"><p>Your new password is: <strong style="font-size: 18px; color: #007bff;">${newPassword}</strong></p></div>`,
		);

		if (!emailSent) {
			throw new BadRequestException(
				'Failed to send password change email',
			);
		}
	}

	/**
	 * Updates user location fields (and optional driver status). After DB save, DRIVER users sync to TMS
	 * unless `isBackgroundTaskLocationUpdate` is true (background task pings — DB + WebSocket only).
	 * Verbose `[manual]` logs only when `isManualDriverLocationAction` is true (status submit / Share location from app).
	 */
	async updateUserLocation(id: string, locationDto: UpdateUserLocationDto) {
		const user = await this.prisma.user.findUnique({
			where: { id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		const env =
			await this.appSettingsService.getLocationEnvironmentAppSettings();
		if (env.locationEnvironmentMode === 'test') {
			const allowed = env.locationTestDriverExternalId.trim();
			if (user.externalId?.trim() !== allowed) {
				throw new ForbiddenException(
					'Location updates are disabled for this account (server is in test mode; only the configured test driver may update location).',
				);
			}
		}

		const isBackgroundPing =
			locationDto.isBackgroundTaskLocationUpdate === true;
		const isManualAction =
			locationDto.isManualDriverLocationAction === true;
		if (isBackgroundPing) {
			this.logger.log(
				`Location update [background] userId=${id} role=${user.role} externalId=${user.externalId ?? ''}`,
			);
		}

		const data: Prisma.UserUpdateInput = {
			city: locationDto.city,
			state: locationDto.state,
			zip: locationDto.zip,
			latitude: locationDto.latitude,
			longitude: locationDto.longitude,
			lastLocationUpdateAt: locationDto.lastLocationUpdateAt,
		};
		// Do not overwrite DB `location` when client sends no TMS code (empty string).
		const locationIncoming = locationDto.location;
		if (
			locationIncoming !== undefined &&
			locationIncoming !== null &&
			String(locationIncoming).trim() !== ''
		) {
			data.location = locationIncoming;
		}

		// Ignore empty/whitespace driverStatus (client may send "" from stale cache) — do not wipe DB or TMS.
		const driverStatusPatch =
			locationDto.driverStatus !== undefined &&
			String(locationDto.driverStatus).trim() !== ''
				? String(locationDto.driverStatus).trim()
				: undefined;
		if (driverStatusPatch !== undefined) {
			data.driverStatus = driverStatusPatch;
		}
		if (locationDto.statusDate !== undefined) {
			data.statusDate = locationDto.statusDate;
		}
		if (locationDto.isAutoupdate !== undefined) {
			data.isAutoupdate = locationDto.isAutoupdate;
		}

		const updatedUser = await this.prisma.user.update({
			where: { id },
			data,
			select: {
				id: true,
				externalId: true,
				email: true,
				firstName: true,
				lastName: true,
				role: true,
				location: true,
				city: true,
				state: true,
				zip: true,
				latitude: true,
				longitude: true,
				updatedAt: true,
				lastLocationUpdateAt: true,
				driverStatus: true,
				statusDate: true,
				isAutoupdate: true,
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

		const requestSnapshot = {
			location: locationDto.location,
			city: locationDto.city,
			state: locationDto.state,
			zip: locationDto.zip,
			latitude: locationDto.latitude,
			longitude: locationDto.longitude,
			lastLocationUpdateAt: locationDto.lastLocationUpdateAt,
			driverStatus: locationDto.driverStatus,
			statusDate: locationDto.statusDate,
			country: locationDto.country,
			isAutoupdate: locationDto.isAutoupdate,
		};

		const logManual = (payload: {
			tmsPayload: ReturnType<typeof buildTmsBatchLocationItem>;
			tmsSkipReason?: string;
		}) => {
			if (!isManualAction) {
				return;
			}
			this.logger.log(
				`Location update [manual] userId=${id} ` +
					JSON.stringify({
						request: requestSnapshot,
						tmsPayload: payload.tmsPayload,
						tmsSkipReason: payload.tmsSkipReason,
					}),
			);
		};

		const shouldSyncTms =
			updatedUser.role === UserRole.DRIVER &&
			!!updatedUser.externalId?.trim();

		if (!shouldSyncTms) {
			if (!isBackgroundPing) {
				logManual({
					tmsPayload: null,
					tmsSkipReason: 'not_driver_or_no_external_id',
				});
			}
			return updatedUser;
		}

		// Automatic background pings: persist location only; TMS sync uses cron batch.
		if (isBackgroundPing) {
			return updatedUser;
		}

		const extApi = this.configService.get<ExternalApiConfig>('externalApi');
		if (extApi?.skipTmsDriverLocationSync) {
			logManual({
				tmsPayload: null,
				tmsSkipReason: 'skipTmsDriverLocationSync',
			});
			return updatedUser;
		}

		const tmsStatus =
			driverStatusPatch !== undefined
				? driverStatusPatch
				: (updatedUser.driverStatus ?? '').trim();
		const statusDateForFormat =
			locationDto.statusDate !== undefined
				? locationDto.statusDate
				: updatedUser.statusDate;
		const statusDateTrimmed =
			statusDateForFormat != null
				? String(statusDateForFormat).trim()
				: '';
		const statusDateFormatted =
			statusDateTrimmed !== ''
				? formatTmsStatusDate(statusDateForFormat as string)
				: '';

		const effectiveLocationForTms =
			locationDto.location != null &&
			String(locationDto.location).trim() !== ''
				? locationDto.location
				: (updatedUser.location ?? '');

		const batchItem = buildTmsBatchLocationItem({
			externalId: updatedUser.externalId as string,
			driverStatus: tmsStatus ?? '',
			statusDateFormatted,
			location: effectiveLocationForTms,
			// TMS current_city = DB `city` after save; empty → '' (trim in builder).
			city: updatedUser.city ?? '',
			zip: locationDto.zip ?? updatedUser.zip ?? '',
			latitude: locationDto.latitude ?? updatedUser.latitude ?? 0,
			longitude: locationDto.longitude ?? updatedUser.longitude ?? 0,
			country: '',
			notes: '',
		});

		if (!batchItem) {
			logManual({
				tmsPayload: null,
				tmsSkipReason: `non_numeric_external_id:${updatedUser.externalId ?? ''}`,
			});
			return updatedUser;
		}

		logManual({ tmsPayload: batchItem });

		try {
			await this.tmsDriverLocationBatch.sendBatch([batchItem]);
		} catch (err) {
			const tmsError = err instanceof Error ? err.message : String(err);
			throw new HttpException(
				{
					statusCode: HttpStatus.SERVICE_UNAVAILABLE,
					message: 'Location saved but TMS sync failed',
					databaseUpdated: true,
					tmsError,
					user: updatedUser,
				},
				HttpStatus.SERVICE_UNAVAILABLE,
			);
		}

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

		const wasActive = user.status === UserStatus.ACTIVE;

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

		if (
			status === UserStatus.ACTIVE &&
			!wasActive &&
			user.role === UserRole.DRIVER &&
			user.externalId &&
			user.externalId.trim() !== ''
		) {
			void this.tmsDriverApplication.notifyDriverApplicationActivated(
				user.externalId,
			);
		}

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
			status_date,
			current_location,
			current_city,
			current_zipcode,
			latitude,
			longitude,
			permission_view,
		} = driver_data;

		// Normalize permission_view to our allowed company values.
		const normalizeCompany = (value?: string[]): string[] => {
			if (!Array.isArray(value) || value.length === 0) return [];
			const allowedMap = new Map<
				string,
				'Odysseia' | 'Martlet' | 'Endurance'
			>([
				['odysseia', 'Odysseia'],
				['martlet', 'Martlet'],
				['endurance', 'Endurance'],
			]);
			const normalized: Array<'Odysseia' | 'Martlet' | 'Endurance'> = [];
			for (const item of value) {
				if (typeof item !== 'string') continue;
				const canon = allowedMap.get(item.trim().toLowerCase());
				if (!canon) continue;
				if (!normalized.includes(canon)) normalized.push(canon);
			}
			return normalized;
		};

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

		// Extract only numeric zip from current_zipcode (TMS may send "City 80011" instead of just "80011")
		const extractZipCode = (value: string | undefined): string | null => {
			if (!value || typeof value !== 'string') return null;
			const trimmed = value.trim();
			// Match US zip (5 digits or 5+4) - handles "Aurora 80011", "80011", etc.
			const match = trimmed.match(/\d{5}(-\d{4})?/);
			if (match) return match[0];
			// Pure digits (international postal codes)
			if (/^\d+$/.test(trimmed)) return trimmed;
			return null;
		};

		const userData: Prisma.UserUncheckedCreateInput = {
			externalId: driverId,
			email: driver_email,
			firstName,
			lastName,
			phone: driver_phone,
			location: current_location || home_location, // Use current_location if available, fallback to home_location
			city: current_city || null,
			zip: extractZipCode(current_zipcode),
			role: mappedRole,
			vin,
			type: vehicle_type,
			driverStatus: driver_status ?? null,
			statusDate: status_date ?? null,
			latitude: parseCoordinate(latitude),
			longitude: parseCoordinate(longitude),
			company: normalizeCompany(permission_view),
			// Only ACTIVE drivers should ever have is_autoupdate enabled (cron filters by ACTIVE).
			// New users default to INACTIVE, so keep it false on create.
			isAutoupdate: false,
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
				action: 'created',
				user: newUser,
			};
		} else if (type === WebhookType.UPDATE) {
			// Find user by externalId
			const existingUser = await this.prisma.user.findFirst({
				where: { externalId: driverId },
			});

			if (!existingUser) {
				// TMS may send "update" before our DB has the driver (desync) — create instead of 404
				this.logger.warn(
					`[Webhook Driver] UPDATE for unknown externalId=${driverId} — creating user (sync recovery)`,
				);
				const conflict = await this.prisma.user.findFirst({
					where: {
						OR: [{ externalId: driverId }, { email: driver_email }],
					},
				});
				if (conflict) {
					throw new ConflictException('Driver already exists');
				}
				const newUser = await this.prisma.user.create({
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
					action: 'created',
					user: newUser,
					message:
						'Driver created (update webhook; external id was missing locally)',
				};
			}

			const oldDriverStatus = existingUser.driverStatus;

			// Partial update: only set fields present in the webhook payload so we do not
			// wipe driverStatus/zip/etc. when TMS omits them (was: driver_status || null).
			const updateData: Prisma.UserUpdateInput = {
				email: driver_email,
				firstName,
				lastName,
			};

			if (driver_phone !== undefined) {
				updateData.phone = driver_phone || null;
			}
			if (driver_status !== undefined) {
				updateData.driverStatus = driver_status || null;
				// Enable auto-update only for ACTIVE accounts; for non-ACTIVE, force-disable to fix past incorrect values.
				updateData.isAutoupdate =
					existingUser.status === UserStatus.ACTIVE
						? this.isAutoupdateForTmsDriverStatus(driver_status)
						: false;
			}
			if (status_date !== undefined) {
				updateData.statusDate = status_date || null;
			}
			if (home_location !== undefined || current_location !== undefined) {
				const loc = current_location ?? home_location;
				updateData.location = loc ?? null;
			}
			if (current_city !== undefined) {
				updateData.city = current_city || null;
			}
			if (current_zipcode !== undefined) {
				updateData.zip = extractZipCode(current_zipcode);
			}
			if (vehicle_type !== undefined) {
				updateData.type = vehicle_type || null;
			}
			if (vin !== undefined) {
				updateData.vin = vin || null;
			}
			if (latitude !== undefined) {
				updateData.latitude = parseCoordinate(latitude);
			}
			if (longitude !== undefined) {
				updateData.longitude = parseCoordinate(longitude);
			}
			if (permission_view !== undefined) {
				updateData.company = normalizeCompany(permission_view);
			}

			const updatedUser = await this.prisma.user.update({
				where: { id: existingUser.id },
				data: updateData,
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
					driverStatus: true,
					statusDate: true,
					isAutoupdate: true,
				},
			});

			await this.notificationsWebSocketService.sendDriverProfileSync(
				existingUser.id,
				{
					driverStatus: updatedUser.driverStatus ?? null,
					zip: updatedUser.zip ?? null,
					city: updatedUser.city ?? null,
					state: updatedUser.state ?? null,
					location: updatedUser.location ?? null,
					statusDate: updatedUser.statusDate ?? null,
					isAutoupdate: updatedUser.isAutoupdate ?? false,
				},
			);

			const newDriverStatus = updatedUser.driverStatus ?? null;
			if (oldDriverStatus !== newDriverStatus) {
				await this.notificationsWebSocketService.sendDriverStatusUpdate(
					existingUser.id,
					{
						driverStatus: newDriverStatus,
						isAutoupdate: updatedUser.isAutoupdate ?? false,
					},
				);
				// Best-effort push: app may be in background and miss WebSocket.
				this.notificationsService
					.sendDriverStatusChangedPush({
						userId: existingUser.id,
						driverStatus: newDriverStatus,
					})
					.catch(() => {});
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
