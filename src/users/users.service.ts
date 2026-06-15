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
import {
	compareAppVersionValues,
	getLowestAppVersion,
	isAppVersionBelowMinimum,
} from '../common/app-version.util';
import { buildUserTextSearchWhereInput } from './user-text-search.util';
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
import { TmsLoadDetailsService } from '../tms/tms-load-details.service';
import { formatTmsStatusDate } from '../tms/tms-status-date.util';
import type { ExternalApiConfig } from '../config/env.config';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
	normalizeLocationDeviceSnapshot,
	upsertUserDeviceSnapshot,
	type LocationDeviceSnapshot,
} from '../common/upsert-user-device';
import { NotificationsService } from '../notifications/notifications.service';
import {
	logLocationUpdateFailure,
	type LocationUpdateRequestTrace,
} from './utils/location-update-failure.logger';
import { DriverReverseGeocodeService } from '../geocoding/driver-reverse-geocode.service';
import type { DriverReverseGeocodeResult } from '../geocoding/driver-reverse-geocode.types';
import { isAllowedNorthAmericaLatLng, type LatLng } from '../geocoding/north-america-bbox.util';
import { resolveTmsLocationCode } from '../tms/tms-current-location.util';
import { formatDriverLocationPersistedLog } from '../geocoding/driver-location-save-log.util';

function trimLocationField(value: unknown): string {
	if (value === undefined || value === null) {
		return '';
	}
	return String(value).trim();
}

/** Human-readable label for background location logs (PostGIS / cache / HERE / etc.). */
function formatAddressGeocodeSourceLabel(
	geo: DriverReverseGeocodeResult,
): string {
	if (geo.source === 'geo_zips') {
		return geo.match ? `geo_zips:${geo.match}` : 'geo_zips';
	}
	return geo.source;
}

const DEFAULT_TRACKING_POINT_MIN_INTERVAL_MS = 30 * 60 * 1000;
const TRACKING_POINT_MIN_DISTANCE_M = 5000;

function distanceMeters(a: LatLng, b: LatLng): number {
	const earthRadiusM = 6_371_000;
	const toRad = (value: number) => (value * Math.PI) / 180;
	const dLat = toRad(b.latitude - a.latitude);
	const dLng = toRad(b.longitude - a.longitude);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a.latitude)) *
			Math.cos(toRad(b.latitude)) *
			Math.sin(dLng / 2) ** 2;

	return 2 * earthRadiusM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

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
		private readonly tmsLoadDetails: TmsLoadDetailsService,
		private readonly configService: ConfigService,
		private readonly appSettingsService: AppSettingsService,
		private readonly driverReverseGeocode: DriverReverseGeocodeService,
	) {}

	private async buildExcludeLocationTestDriverClause(): Promise<
		Prisma.UserWhereInput[]
	> {
		const env =
			await this.appSettingsService.getLocationEnvironmentAppSettings();
		const testExtId = env.locationTestDriverExternalId?.trim();
		if (!testExtId) return [];
		return [
			{
				NOT: {
					externalId: { equals: testExtId, mode: 'insensitive' },
				},
			},
		];
	}

	private parseNaiveDateTime(value: string | null | undefined): Date | null {
		const trimmed = value?.trim();
		if (!trimmed) return null;
		const match = trimmed.match(
			/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
		);
		if (!match) {
			const parsedFallback = new Date(trimmed.replace(' ', 'T'));
			return Number.isFinite(parsedFallback.getTime()) ? parsedFallback : null;
		}
		const [, year, month, day, hour, minute, second] = match;
		const parsed = new Date(
			Date.UTC(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second),
			),
		);
		return Number.isFinite(parsed.getTime()) ? parsed : null;
	}

	/** Human-readable place line for a tracking history point (city, state ZIP). */
	private formatTrackingPlaceLabel(
		city?: string | null,
		state?: string | null,
		zip?: string | null,
	): string | null {
		const c = city?.trim() ?? '';
		const s = state?.trim() ?? '';
		const z = zip?.trim() ?? '';
		const cityState = [c, s].filter(Boolean).join(', ');
		if (cityState && z) return `${cityState} ${z}`;
		if (cityState) return cityState;
		if (z) return z;
		return null;
	}

	/** Same NY wall-clock string format as `updateUserLocation` (YYYY-MM-DD HH:mm:ss). */
	private formatNyWallClockSqlString(instant: Date): string {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/New_York',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		}).formatToParts(instant);
		const get = (type: string) =>
			parts.find((p) => p.type === type)?.value ?? '';
		return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get(
			'minute',
		)}:${get('second')}`;
	}

	private async maybeCreateDriverTrackingPoint(
		user: {
			id: string;
			externalId: string | null;
			role: UserRole;
			isTracking: boolean;
			trackingLoadId: string | null;
			driverStatus: string | null;
			latitude: number | null;
			longitude: number | null;
			lastLocationUpdateAt: string | null;
			city: string | null;
			state: string | null;
			zip: string | null;
		},
		deviceSnapshot?: LocationDeviceSnapshot | null,
	): Promise<{
		externalDriverId: string;
		loadId: string;
		latitude: number;
		longitude: number;
		createdAt: Date;
		updatedAt: Date;
		placeLabel: string | null;
		deviceId: string | null;
		deviceModel: string | null;
		deviceName: string | null;
		devicePlatform: string | null;
	} | null> {
		if (user.role !== UserRole.DRIVER || !user.isTracking) return null;
		if (user.driverStatus?.trim().toLowerCase() !== 'loaded_enroute') {
			return null;
		}

		const externalDriverId = user.externalId?.trim();
		const loadId = user.trackingLoadId?.trim();
		if (!externalDriverId || !loadId) return null;
		if (typeof user.latitude !== 'number' || typeof user.longitude !== 'number') {
			return null;
		}

		const pointTime = this.parseNaiveDateTime(user.lastLocationUpdateAt);
		if (!pointTime) {
			this.logger.warn(
				`Driver tracking point skipped: invalid lastLocationUpdateAt userId=${user.id} value=${JSON.stringify(user.lastLocationUpdateAt)}`,
			);
			return null;
		}

		const latest = await this.prisma.driverTracking.findFirst({
			where: { externalDriverId, loadId },
			orderBy: { updatedAt: 'desc' },
			select: { updatedAt: true, latitude: true, longitude: true },
		});
		const minIntervalMs =
			await this.appSettingsService.getDriverTrackingPointMinIntervalMs();
		const effectiveMinIntervalMs = Number.isFinite(minIntervalMs)
			? minIntervalMs
			: DEFAULT_TRACKING_POINT_MIN_INTERVAL_MS;

		if (latest) {
			const distanceFromLatestM = distanceMeters(
				{ latitude: latest.latitude, longitude: latest.longitude },
				{ latitude: user.latitude, longitude: user.longitude },
			);
			if (distanceFromLatestM < TRACKING_POINT_MIN_DISTANCE_M) {
				return null;
			}
		}

		if (
			latest &&
			pointTime.getTime() - latest.updatedAt.getTime() < effectiveMinIntervalMs
		) {
			return null;
		}

		return this.prisma.driverTracking.create({
			data: {
				externalDriverId,
				loadId,
				latitude: user.latitude,
				longitude: user.longitude,
				createdAt: pointTime,
				updatedAt: pointTime,
				placeLabel: this.formatTrackingPlaceLabel(
					user.city,
					user.state,
					user.zip,
				),
				deviceId: deviceSnapshot?.deviceId ?? null,
				deviceModel: deviceSnapshot?.deviceModel ?? null,
				deviceName: deviceSnapshot?.deviceName ?? null,
				devicePlatform: deviceSnapshot?.devicePlatform ?? null,
			},
			select: {
				externalDriverId: true,
				loadId: true,
				latitude: true,
				longitude: true,
				createdAt: true,
				updatedAt: true,
				placeLabel: true,
				deviceId: true,
				deviceModel: true,
				deviceName: true,
				devicePlatform: true,
			},
		});
	}

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
		hasUserDevice: boolean = false,
	) {
		const skip = (page - 1) * limit;

		const andFilters: Prisma.UserWhereInput[] = [];

		if (roles && roles.length > 0) {
			andFilters.push({ role: { in: roles } });
		}

		if (status) {
			andFilters.push({ status });
		}

		if (company) {
			const allowed = ['Odysseia', 'Martlet', 'Endurance'];
			if (!allowed.includes(company)) {
				throw new BadRequestException('Invalid company value');
			}
			// users.company is TEXT[] (Prisma String[])
			andFilters.push({ company: { has: company } });
		}

		const searchFilter = buildUserTextSearchWhereInput(search, {
			includePhone: true,
		});
		if (searchFilter) {
			andFilters.push(searchFilter);
		}

		if (hasUserDevice) {
			// `user_devices` is keyed by `users.externalId` (relation on User.userDevices)
			andFilters.push({ userDevices: { some: {} } });
		}

		const where: Prisma.UserWhereInput =
			andFilters.length > 0 ? { AND: andFilters } : {};

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
					userColor: true,
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
			userColor: user.userColor ?? null,
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
	 * ACTIVE drivers with loaded_enroute|available (or subset), last location string (NY wall-clock)
	 * older than 3h vs current NY time.
	 * Rows are ordered by lastLocationUpdateAt (asc | desc), then id in the same direction.
	 * @param driverStatusFilter all | available | loaded_enroute
	 * @param search optional: matches first name, last name, email, externalId (case-insensitive)
	 * @param lastLocationSort asc = oldest location first (default), desc = newest stale location first
	 */
	async findDriversCheckList(
		page: number = 1,
		limit: number = 10,
		driverStatusFilter: 'all' | 'available' | 'loaded_enroute' = 'all',
		search?: string,
		lastLocationSort: 'asc' | 'desc' = 'asc',
	) {
		const safePage = Math.max(1, page);
		const safeLimit = Math.min(100, Math.max(1, limit));
		const skip = (safePage - 1) * safeLimit;

		const threeHoursAgoNy = this.formatNyWallClockSqlString(
			new Date(Date.now() - 3 * 60 * 60 * 1000),
		);

		const statusOr: Prisma.UserWhereInput[] =
			driverStatusFilter === 'available'
				? [{ driverStatus: { equals: 'available', mode: 'insensitive' } }]
				: driverStatusFilter === 'loaded_enroute'
					? [{ driverStatus: { equals: 'loaded_enroute', mode: 'insensitive' } }]
					: [
							{
								driverStatus: {
									equals: 'loaded_enroute',
									mode: 'insensitive',
								},
							},
							{
								driverStatus: {
									equals: 'available',
									mode: 'insensitive',
								},
							},
						];

		const searchFilter = buildUserTextSearchWhereInput(search, {
			includeExternalId: true,
			includeTrackingLoadId: true,
		});
		const searchClause: Prisma.UserWhereInput[] = searchFilter
			? [searchFilter]
			: [];
		const excludeTestDriverClause =
			await this.buildExcludeLocationTestDriverClause();

		const where: Prisma.UserWhereInput = {
			role: UserRole.DRIVER,
			status: UserStatus.ACTIVE,
			AND: [
				// Exclude TMS soft-removed drivers (deactivateAccount === true)
				{ deactivateAccount: { not: true } },
				{ OR: statusOr },
				{ lastLocationUpdateAt: { not: null } },
				{ NOT: { lastLocationUpdateAt: '' } },
				{ lastLocationUpdateAt: { lt: threeHoursAgoNy } },
				...excludeTestDriverClause,
				...searchClause,
			],
		};

		try {
			const [total, rows] = await Promise.all([
				this.prisma.user.count({ where }),
				this.prisma.user.findMany({
					where,
					orderBy: [
						{ lastLocationUpdateAt: lastLocationSort },
						{ id: lastLocationSort },
					],
					skip,
					take: safeLimit,
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						externalId: true,
						phone: true,
						driverStatus: true,
						lastActiveApp: true,
						lastLocationUpdateAt: true,
						trackingLoadId: true,
					},
				}),
			]);

			const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

			return {
				drivers: rows.map((d) => ({
					id: d.id,
					firstName: d.firstName,
					lastName: d.lastName,
					email: d.email,
					externalId: d.externalId,
					phone: d.phone ?? '',
					driverStatus: d.driverStatus,
					lastActiveApp: d.lastActiveApp?.toISOString() ?? null,
					lastLocationUpdateAt: d.lastLocationUpdateAt,
					trackingLoadId: d.trackingLoadId,
				})),
				pagination: {
					current_page: safePage,
					per_page: safeLimit,
					total_count: total,
					total_pages: totalPages,
					has_next_page: safePage < totalPages,
					has_prev_page: safePage > 1,
				},
			};
		} catch (err: unknown) {
			this.logger.error('findDriversCheckList failed', err);
			throw err;
		}
	}

	/**
	 * Drivers with outdated app version and/or multiple devices on one account.
	 * Returns all devices per matching driver. Paginated by driver.
	 */
	async findDriversCheckListVersion(
		page: number = 1,
		limit: number = 10,
		search?: string,
		appVersionSort: 'asc' | 'desc' = 'asc',
	) {
		const safePage = Math.max(1, page);
		const safeLimit = Math.min(100, Math.max(1, limit));
		const skip = (safePage - 1) * safeLimit;

		const settings = await this.appSettingsService.getMinimumAppVersionSettings();
		const minimumAppVersion = (settings.minimumAppVersion ?? '').trim();

		const emptyPagination = {
			current_page: safePage,
			per_page: safeLimit,
			total_count: 0,
			total_pages: 0,
			has_next_page: false,
			has_prev_page: false,
		};

		if (!minimumAppVersion) {
			return {
				drivers: [],
				minimumAppVersion: '',
				pagination: emptyPagination,
			};
		}

		const searchFilter = buildUserTextSearchWhereInput(search, {
			includeExternalId: true,
			includeTrackingLoadId: false,
		});
		const searchClause: Prisma.UserWhereInput[] = searchFilter
			? [searchFilter]
			: [];
		const excludeTestDriverClause =
			await this.buildExcludeLocationTestDriverClause();

		const where: Prisma.UserWhereInput = {
			role: UserRole.DRIVER,
			status: UserStatus.ACTIVE,
			AND: [
				{ deactivateAccount: { not: true } },
				{
					NOT: {
						driverStatus: { equals: 'blocked', mode: 'insensitive' },
					},
				},
				{ userDevices: { some: {} } },
				...excludeTestDriverClause,
				...searchClause,
			],
		};

		try {
			const rows = await this.prisma.user.findMany({
				where,
				orderBy: [
					{ lastName: 'asc' },
					{ firstName: 'asc' },
					{ id: 'asc' },
				],
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					externalId: true,
					phone: true,
					userDevices: {
						select: {
							id: true,
							platform: true,
							appVersion: true,
							deviceName: true,
							model: true,
						},
						orderBy: [{ platform: 'asc' }, { updatedAt: 'desc' }],
					},
				},
			});

			const matching = rows.filter((user) => {
				if (user.userDevices.length >= 2) {
					return true;
				}
				return user.userDevices.some((device) =>
					isAppVersionBelowMinimum(device.appVersion, minimumAppVersion),
				);
			});

			const sortMultiplier = appVersionSort === 'desc' ? -1 : 1;
			matching.sort((a, b) => {
				const versionCmp =
					compareAppVersionValues(
						getLowestAppVersion(a.userDevices.map((d) => d.appVersion)),
						getLowestAppVersion(b.userDevices.map((d) => d.appVersion)),
					) * sortMultiplier;
				if (versionCmp !== 0) return versionCmp;
				const lastCmp = a.lastName.localeCompare(b.lastName, undefined, {
					sensitivity: 'base',
				});
				if (lastCmp !== 0) return lastCmp;
				const firstCmp = a.firstName.localeCompare(b.firstName, undefined, {
					sensitivity: 'base',
				});
				if (firstCmp !== 0) return firstCmp;
				return a.id.localeCompare(b.id);
			});

			const total = matching.length;
			const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);
			const pageRows = matching.slice(skip, skip + safeLimit);

			const sortDevices = (
				devices: (typeof rows)[number]['userDevices'],
			) =>
				[...devices].sort(
					(a, b) =>
						compareAppVersionValues(a.appVersion, b.appVersion) * sortMultiplier,
				);

			return {
				drivers: pageRows.map((d) => ({
					id: d.id,
					firstName: d.firstName,
					lastName: d.lastName,
					email: d.email,
					externalId: d.externalId,
					phone: d.phone ?? '',
					devices: sortDevices(d.userDevices).map((device) => ({
						id: device.id,
						platform: device.platform,
						appVersion: device.appVersion,
						deviceName: device.deviceName,
						model: device.model,
					})),
				})),
				minimumAppVersion,
				pagination: {
					current_page: safePage,
					per_page: safeLimit,
					total_count: total,
					total_pages: totalPages,
					has_next_page: safePage < totalPages,
					has_prev_page: safePage > 1,
				},
			};
		} catch (err: unknown) {
			this.logger.error('findDriversCheckListVersion failed', err);
			throw err;
		}
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
				deactivateAccount: true,
				notificationsEnabled: true,
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
			deactivateAccount: user.deactivateAccount === true,
			notificationsEnabled: user.notificationsEnabled !== false,
		};
	}

	async getNotificationPreferences(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, notificationsEnabled: true },
		});
		if (!user) {
			throw new NotFoundException('User not found');
		}
		return { notificationsEnabled: user.notificationsEnabled !== false };
	}

	async updateNotificationPreferences(
		userId: string,
		notificationsEnabled: boolean,
	) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true },
		});
		if (!user) {
			throw new NotFoundException('User not found');
		}
		await this.prisma.user.update({
			where: { id: userId },
			data: { notificationsEnabled },
			select: { id: true },
		});
		return { notificationsEnabled };
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
				isTracking: true,
				trackingLoadId: true,
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
	 * TMS webhook: soft-remove or restore driver — updates users.deactivateAccount by externalId.
	 */
	async applyTmsDriverRemoveWebhook(
		driverId: string,
		event: 'remove-soft' | 'restore',
	) {
		const externalId = String(driverId ?? '').trim();
		if (!externalId) {
			throw new BadRequestException('driverId is required');
		}

		const deactivateAccount = event === 'remove-soft';

		const existing = await this.prisma.user.findFirst({
			where: { externalId },
			select: { id: true },
		});

		if (!existing) {
			throw new NotFoundException(
				`User with externalId matching driverId not found`,
			);
		}

		const user = await this.prisma.user.update({
			where: { id: existing.id },
			data: { deactivateAccount },
			select: {
				id: true,
				externalId: true,
				deactivateAccount: true,
				updatedAt: true,
			},
		});

		const profile = await this.prisma.user.findUnique({
			where: { id: existing.id },
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
				deactivateAccount: true,
			},
		});
		if (profile?.role === UserRole.DRIVER) {
			await this.notificationsWebSocketService.sendDriverProfileSync(
				profile.id,
				{
					driverStatus: profile.driverStatus ?? null,
					zip: profile.zip ?? null,
					city: profile.city ?? null,
					state: profile.state ?? null,
					location: profile.location ?? null,
					statusDate: profile.statusDate ?? null,
					isAutoupdate: profile.isAutoupdate ?? false,
					deactivateAccount: profile.deactivateAccount === true,
				},
			);
		}

		return {
			driverId: externalId,
			event,
			user,
		};
	}

	/**
	 * Finds user by external ID
	 */
	async findUserByExternalId(
		externalId: string,
		options?: { includeTmsLoadRouteLocations?: boolean },
	) {
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
				lastActiveApp: true,
				isTracking: true,
				trackingLoadId: true,
			},
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		const withLastActiveApp = {
			...user,
			lastActiveApp: user.lastActiveApp?.toISOString() ?? null,
		};

		if (options?.includeTmsLoadRouteLocations !== true) {
			return withLastActiveApp;
		}

		const trackingLoadId = withLastActiveApp.trackingLoadId?.trim() || null;
		const [tmsLoadRouteLocations, loadHistory] = await Promise.all([
			trackingLoadId
				? this.tmsLoadDetails.fetchRouteLocations(trackingLoadId)
				: Promise.resolve(null),
			withLastActiveApp.isTracking === true &&
				trackingLoadId &&
				withLastActiveApp.externalId
				? this.prisma.driverTracking.findMany({
						where: {
							externalDriverId: withLastActiveApp.externalId,
							loadId: trackingLoadId,
						},
						orderBy: {
							updatedAt: 'asc',
						},
						select: {
							latitude: true,
							longitude: true,
						},
					})
				: Promise.resolve([]),
		]);

		return {
			...withLastActiveApp,
			pick_up_location: tmsLoadRouteLocations?.pick_up_location ?? null,
			delivery_location: tmsLoadRouteLocations?.delivery_location ?? null,
			load_history: loadHistory.map((point) => [
				point.latitude,
				point.longitude,
			]),
		};
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

	/** Manual driver credentials: bcrypt password + OTP valid for 24 hours. */
	async setDriverPasswordAndOtp(
		externalId: string,
		password: string,
		otp: string,
	): Promise<{ message: string }> {
		const normalizedExternalId = externalId.trim();
		if (!normalizedExternalId) {
			throw new BadRequestException('Driver external ID is required');
		}

		const driver = await this.prisma.user.findFirst({
			where: {
				externalId: normalizedExternalId,
				role: UserRole.DRIVER,
			},
			select: { id: true, email: true },
		});

		if (!driver) {
			throw new NotFoundException('Driver not found');
		}

		const normalizedOtp = otp.trim();
		const hashedPassword = await bcrypt.hash(password, 12);
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

		await this.prisma.$transaction([
			this.prisma.user.update({
				where: { id: driver.id },
				data: { password: hashedPassword },
			}),
			this.prisma.otpCode.updateMany({
				where: {
					email: driver.email,
					isUsed: false,
				},
				data: { isUsed: true },
			}),
			this.prisma.otpCode.create({
				data: {
					email: driver.email,
					code: normalizedOtp,
					expiresAt,
				},
			}),
		]);

		return { message: 'Driver password and OTP set successfully' };
	}

	/**
	 * Updates user location fields (and optional driver status). After DB save, DRIVER users sync to TMS
	 * unless `isBackgroundTaskLocationUpdate` is true (background task pings — DB + WebSocket only).
	 * Verbose `[manual]` logs only when `isManualDriverLocationAction` is true (status submit / Share location from app).
	 */
	async updateUserLocation(
		id: string,
		locationDto: UpdateUserLocationDto,
		requestTrace: LocationUpdateRequestTrace = {},
	) {
		const trace: LocationUpdateRequestTrace = {
			...requestTrace,
			isBackgroundPing: locationDto.isBackgroundTaskLocationUpdate === true,
			isManualAction: locationDto.isManualDriverLocationAction === true,
		};

		const user = await this.prisma.user.findUnique({
			where: { id },
		});

		if (!user) {
			logLocationUpdateFailure(this.logger, {
				userId: id,
				externalId: null,
				source: 'not_found',
				httpStatus: HttpStatus.NOT_FOUND,
				reason:
					'User record not found for the resolved user id (JWT sub or URL :id). Location was not saved.',
				trace,
				payload: locationDto,
			});
			throw new NotFoundException('User not found');
		}

		const externalIdForLogs = user.externalId ?? null;

		const deviceSnapshot = normalizeLocationDeviceSnapshot(locationDto);
		if (deviceSnapshot && user.externalId?.trim()) {
			try {
				await upsertUserDeviceSnapshot(this.prisma, {
					userExternalId: user.externalId.trim(),
					deviceId: deviceSnapshot.deviceId!,
					platform: deviceSnapshot.devicePlatform,
					deviceName: deviceSnapshot.deviceName,
					model: deviceSnapshot.deviceModel,
				});
			} catch (deviceErr) {
				this.logger.warn(
					`Failed to upsert user device snapshot userId=${id} deviceId=${deviceSnapshot.deviceId}: ${
						deviceErr instanceof Error ? deviceErr.message : String(deviceErr)
					}`,
				);
			}
		}

		const env =
			await this.appSettingsService.getLocationEnvironmentAppSettings();
		const allowedTestExternalId = env.locationTestDriverExternalId.trim();
		const isTestDriver =
			!!user.externalId?.trim() &&
			user.externalId.trim() === allowedTestExternalId;
		if (env.locationEnvironmentMode === 'test') {
			if (!isTestDriver) {
				logLocationUpdateFailure(
					this.logger,
					{
						userId: id,
						externalId: externalIdForLogs,
						source: 'test_mode',
						httpStatus: HttpStatus.FORBIDDEN,
						reason:
							'Location environment is in test mode; only the configured test driver externalId may update location. Request rejected before save.',
						trace,
						payload: locationDto,
						details: {
							locationEnvironmentMode: env.locationEnvironmentMode,
							allowedTestDriverExternalId:
								allowedTestExternalId || '(empty)',
						},
					},
					'warn',
				);
				throw new ForbiddenException(
					'Location updates are disabled for this account (server is in test mode; only the configured test driver may update location).',
				);
			}
		}

		// Geo-fence: block automatic pings outside NA (wrong GPS). Manual Share allowed for dev/test abroad.
		const isBackgroundPing =
			locationDto.isBackgroundTaskLocationUpdate === true;
		const isManualAction =
			locationDto.isManualDriverLocationAction === true;

		if (
			!isTestDriver &&
			!isManualAction &&
			typeof locationDto.latitude === 'number' &&
			typeof locationDto.longitude === 'number'
		) {
			const ok = isAllowedNorthAmericaLatLng({
				latitude: locationDto.latitude,
				longitude: locationDto.longitude,
			});
			if (!ok) {
				logLocationUpdateFailure(this.logger, {
					userId: id,
					externalId: externalIdForLogs,
					source: 'geo_fence',
					httpStatus: HttpStatus.BAD_REQUEST,
					reason:
						'Coordinates are outside the allowed North America region (geo-fence). Location was not saved.',
					trace,
					payload: locationDto,
					details: {
						latitude: locationDto.latitude,
						longitude: locationDto.longitude,
					},
				});
				throw new BadRequestException(
					`Invalid location coordinates (outside allowed region)`,
				);
			}
		}

		const nowNy = (() => {
			const parts = new Intl.DateTimeFormat('en-US', {
				timeZone: 'America/New_York',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false,
			}).formatToParts(new Date());
			const get = (type: string) =>
				parts.find((p) => p.type === type)?.value ?? '';
			// Store as "YYYY-MM-DD HH:mm:ss" (NY wall-clock time).
			return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get(
				'minute',
			)}:${get('second')}`;
		})();

		const hasCoords =
			typeof locationDto.latitude === 'number' &&
			typeof locationDto.longitude === 'number' &&
			Number.isFinite(locationDto.latitude) &&
			Number.isFinite(locationDto.longitude);

		const incomingDriverStatus =
			locationDto.driverStatus !== undefined &&
			String(locationDto.driverStatus).trim() !== ''
				? String(locationDto.driverStatus).trim()
				: undefined;

		if (incomingDriverStatus === 'available' && !hasCoords) {
			logLocationUpdateFailure(this.logger, {
				userId: id,
				externalId: externalIdForLogs,
				source: 'validation',
				httpStatus: HttpStatus.BAD_REQUEST,
				reason:
					'Driver status "available" requires latitude and longitude so the server can geocode zip/city/state.',
				trace,
				payload: locationDto,
			});
			throw new BadRequestException(
				'Latitude and longitude are required when setting driver status to available',
			);
		}

		const clientCity = trimLocationField(locationDto.city);
		const clientState = trimLocationField(locationDto.state);
		const clientZip = trimLocationField(locationDto.zip);
		const clientSentFullAddress = !!(clientCity && clientState && clientZip);

		let resolvedCity = '';
		let resolvedState = '';
		let resolvedZip = '';
		let resolvedTmsLocation = '';
		let addressGeocodeSource: string | null = null;

		if (hasCoords) {
			// Coordinates are authoritative: ignore legacy client Nominatim city/state/zip.
			if (clientSentFullAddress || clientCity || clientState || clientZip) {
				this.logger.log(
					'[ServerGeocode] Client city/state/zip ignored — resolving address from coordinates only',
				);
			}

			if (incomingDriverStatus === 'available') {
				this.logger.log(
					'[ServerGeocode] Driver status → available: resolving zip/city/state from GPS via geo_zips',
				);
			}

			this.logger.log(
				`[ServerGeocode] Resolving from coordinates via ${
					isAllowedNorthAmericaLatLng({
						latitude: locationDto.latitude as number,
						longitude: locationDto.longitude as number,
					})
						? 'PostGIS → cache → HERE'
						: 'Nominatim (outside North America)'
				}`,
			);

			const geo = await this.driverReverseGeocode.reverseGeocode(
				locationDto.latitude as number,
				locationDto.longitude as number,
			);

			if (geo) {
				const filled: string[] = [];
				if (geo.city?.trim()) {
					resolvedCity = geo.city.trim();
					filled.push('city');
				}
				if (geo.state?.trim()) {
					resolvedState =
						geo.source === 'nominatim' && geo.countryCode?.trim()
							? `${geo.state.trim()}, ${geo.countryCode.trim()}`.trim()
							: geo.state.trim();
					filled.push('state');
				}
				if (geo.zip?.trim()) {
					resolvedZip = geo.zip.trim();
					filled.push('zip');
				}
				const tmsCode = resolveTmsLocationCode(geo.stateCode, geo.state);
				if (tmsCode) {
					resolvedTmsLocation = tmsCode;
					filled.push('location');
				}
				addressGeocodeSource = formatAddressGeocodeSourceLabel(geo);
				if (filled.length > 0) {
					this.logger.log(
						`[ServerGeocode] Resolved via ${addressGeocodeSource} — will persist: ` +
							`location=${resolvedTmsLocation || '(unmapped)'} ` +
							`city="${resolvedCity}" state="${resolvedState}" zip="${resolvedZip}" ` +
							`(fields: ${filled.join(', ')})`,
					);
				} else {
					this.logger.warn(
						`[ServerGeocode] ${geo.source} returned no usable city/state/zip`,
					);
				}
				if (!resolvedTmsLocation && (geo.state?.trim() || geo.stateCode?.trim())) {
					this.logger.warn(
						`[ServerGeocode] Could not map region to TMS location code — stateCode="${geo.stateCode ?? ''}" state="${geo.state ?? ''}"`,
					);
				}
			} else {
				addressGeocodeSource = 'none';
				this.logger.error(
					`[ServerGeocode] FAILED — server reverse geocode unavailable; saving coordinates only (client address ignored) lat=${locationDto.latitude} lng=${locationDto.longitude}`,
				);
			}
		} else {
			resolvedCity = clientCity;
			resolvedState = clientState;
			resolvedZip = clientZip;
			if (clientSentFullAddress) {
				addressGeocodeSource = 'client';
			} else {
				addressGeocodeSource = 'unchanged';
			}
		}

		const data: Prisma.UserUpdateInput = {
			latitude: locationDto.latitude,
			longitude: locationDto.longitude,
			lastLocationUpdateAt: nowNy,
		};

		if (resolvedCity) {
			data.city = resolvedCity;
		}

		if (resolvedState) {
			data.state = resolvedState;
		}

		if (resolvedZip) {
			data.zip = resolvedZip;
		}

		if (resolvedTmsLocation) {
			data.location = resolvedTmsLocation;
		} else if (!hasCoords) {
			// No coordinates: legacy path may still send TMS code from client.
			const locationIncoming = locationDto.location;
			if (
				locationIncoming !== undefined &&
				locationIncoming !== null &&
				String(locationIncoming).trim() !== ''
			) {
				data.location = String(locationIncoming).trim();
			}
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

		let updatedUser;
		try {
			updatedUser = await this.prisma.user.update({
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
					isTracking: true,
					trackingLoadId: true,
				},
			});
		} catch (err) {
			logLocationUpdateFailure(this.logger, {
				userId: id,
				externalId: externalIdForLogs,
				source: 'database',
				httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
				reason:
					'Failed to persist driver location fields in the database (Prisma user.update).',
				trace,
				payload: locationDto,
				details: { prismaUpdateKeys: Object.keys(data) },
				error: err,
			});
			throw err;
		}

		const locationSavedContext = isBackgroundPing
			? 'Location update [background] saved to DB'
			: 'Location update saved to DB';
		this.logger.log(
			formatDriverLocationPersistedLog(
				locationSavedContext,
				updatedUser,
				addressGeocodeSource,
				{
					userId: id,
					role: String(user.role),
					externalId: updatedUser.externalId ?? '',
				},
			),
		);

		const trackingPoint = await this.maybeCreateDriverTrackingPoint(
			updatedUser,
			deviceSnapshot,
		);

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
			isTracking: updatedUser.isTracking,
			trackingLoadId: updatedUser.trackingLoadId,
		});

		if (trackingPoint) {
			void this.notificationsWebSocketService.sendDriverTrackingPointCreated(
				trackingPoint,
			);
		}

		const requestSnapshot = {
			location: locationDto.location,
			city: locationDto.city,
			state: locationDto.state,
			zip: locationDto.zip,
			latitude: locationDto.latitude,
			longitude: locationDto.longitude,
			lastLocationUpdateAt: nowNy,
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
			tmsStatus?.trim().toLowerCase() === 'loaded_enroute'
				? ''
				: statusDateTrimmed !== ''
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
			zip: updatedUser.zip ?? '',
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
			const batchSummary = {
				driver_id: batchItem.driver_id,
				driver_status: batchItem.driver_status,
				status_date: batchItem.status_date,
				current_city: batchItem.current_city,
				current_zipcode: batchItem.current_zipcode,
				current_locationLen: String(batchItem.current_location ?? '').length,
				latitude: batchItem.latitude,
				longitude: batchItem.longitude,
			};

			logLocationUpdateFailure(this.logger, {
				userId: id,
				externalId: updatedUser.externalId ?? externalIdForLogs,
				source: 'tms_sync',
				httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
				reason:
					'Location was saved to the database but TMS driver/location batch sync failed. Client receives HTTP 503.',
				trace,
				payload: locationDto,
				details: {
					databaseUpdated: true,
					driverStatusPatch: driverStatusPatch ?? '',
					tmsStatus: tmsStatus ?? '',
					statusDateFormatted: statusDateFormatted ?? '',
					tmsBatchSummary: batchSummary,
					tmsError,
				},
				error: err,
			});
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
			vehicle_type,
			vin,
			driver_status,
			status_date,
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

		const userData: Prisma.UserUncheckedCreateInput = {
			externalId: driverId,
			email: driver_email,
			firstName,
			lastName,
			phone: driver_phone,
			role: mappedRole,
			vin,
			type: vehicle_type,
			driverStatus: driver_status ?? null,
			statusDate: status_date ?? null,
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
			// wipe driverStatus/etc. when TMS omits them.
			// Location fields (lat/lng, city, zip, state, location) are mobile-only — not TMS.
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
			if (vehicle_type !== undefined) {
				updateData.type = vehicle_type || null;
			}
			if (vin !== undefined) {
				updateData.vin = vin || null;
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
					deactivateAccount: true,
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
					deactivateAccount: updatedUser.deactivateAccount === true,
				},
			);

			const newDriverStatus = updatedUser.driverStatus ?? null;
			if (oldDriverStatus !== newDriverStatus) {
				await this.notificationsWebSocketService.sendDriverStatusUpdate(
					existingUser.id,
					{
						driverStatus: newDriverStatus,
						isAutoupdate: updatedUser.isAutoupdate ?? false,
						deactivateAccount: updatedUser.deactivateAccount === true,
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
