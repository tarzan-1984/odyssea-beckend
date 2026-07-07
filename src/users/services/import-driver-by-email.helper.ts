import { UserRole, UserStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
	type ExternalDriver,
	parseDriverAverageRating,
} from '../interfaces/external-driver.interface';

export type ImportDriverProcessResult = 'imported' | 'updated' | 'skipped';

function splitDriverName(driverName?: string | null) {
	const nameParts = (driverName || '').trim().split(' ');
	return {
		firstName: nameParts[0] || '',
		lastName: nameParts.slice(1).join(' ') || '',
	};
}

/**
 * Import/sync one TMS driver row: match existing users by email (not externalId).
 */
export async function processImportedDriverByEmail(
	prisma: PrismaService,
	driver: ExternalDriver,
	normalizeCompany: (value?: string[] | null) => string[],
): Promise<ImportDriverProcessResult> {
	if (!driver.driver_email || driver.driver_email.trim() === '') {
		return 'skipped';
	}

	const normalizedEmail = driver.driver_email.trim();
	const { firstName, lastName } = splitDriverName(driver.driver_name);
	const permissionView = driver.permission_view ?? [];

	const incoming = {
		externalId: driver.id.toString(),
		email: normalizedEmail,
		firstName,
		lastName,
		phone: driver.driver_phone || '',
		type: driver.type || '',
		vin: driver.vin || '',
		driverStatus: driver.driver_status || null,
		driverRating: parseDriverAverageRating(driver.average_rating),
		company: normalizeCompany(permissionView),
		role: UserRole.DRIVER,
	};

	const existingUser = await prisma.user.findUnique({
		where: { email: normalizedEmail },
	});

	if (existingUser) {
		if (existingUser.role !== UserRole.DRIVER) {
			return 'skipped';
		}

		await prisma.user.update({
			where: { id: existingUser.id },
			data: {
				externalId: incoming.externalId,
				firstName: incoming.firstName,
				lastName: incoming.lastName,
				phone: incoming.phone || null,
				type: incoming.type || null,
				vin: incoming.vin || null,
				driverStatus: incoming.driverStatus,
				driverRating: incoming.driverRating,
				company: incoming.company,
				role: incoming.role,
				// Do not overwrite: password, status, profilePhoto, location, city, state, zip, latitude, longitude.
			},
		});
		return 'updated';
	}

	await prisma.user.create({
		data: {
			externalId: incoming.externalId,
			email: incoming.email,
			firstName: incoming.firstName,
			lastName: incoming.lastName,
			phone: incoming.phone || null,
			type: incoming.type || null,
			vin: incoming.vin || null,
			driverStatus: incoming.driverStatus,
			driverRating: incoming.driverRating,
			company: incoming.company,
			role: incoming.role,
			status: UserStatus.INACTIVE,
			password: null,
		},
	});
	return 'imported';
}
