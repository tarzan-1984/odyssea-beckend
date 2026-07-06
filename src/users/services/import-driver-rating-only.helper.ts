import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
	ExternalDriver,
	parseDriverAverageRating,
} from '../interfaces/external-driver.interface';
import { logImportDuplicate } from './import-duplicate-logger';

function hasDriverRating(value: number | null | undefined): boolean {
	return value != null && Number.isFinite(value);
}

/**
 * TEMPORARY: import only writes driver_rating from TMS average_rating.
 * Skips drivers that already have a rating in DB; does not create new users.
 */
export async function processDriverRatingOnlyImport(
	prisma: PrismaService,
	driver: ExternalDriver,
	duplicateEmails: number[],
	logger: Logger,
): Promise<'imported' | 'updated' | 'skipped'> {
	if (!driver.driver_email?.trim()) {
		logger.warn(`Skipping driver ${driver.id} - no email provided`);
		return 'skipped';
	}

	const driverRating = parseDriverAverageRating(driver.average_rating);
	const externalId = driver.id.toString();
	const email = driver.driver_email.trim();

	const existingUser = await prisma.user.findUnique({
		where: { externalId },
		select: { id: true, driverRating: true },
	});

	if (existingUser) {
		if (hasDriverRating(existingUser.driverRating)) {
			logger.log(
				`Skipping driver ${driver.id} - rating already set (${existingUser.driverRating})`,
			);
			return 'skipped';
		}

		if (driverRating == null) {
			logger.log(
				`Skipping driver ${driver.id} - no average_rating from TMS`,
			);
			return 'skipped';
		}

		await prisma.user.update({
			where: { id: existingUser.id },
			data: { driverRating },
		});
		logger.log(
			`Updated driver ${driver.id} (externalId: ${externalId}) driverRating: ${driverRating}`,
		);
		return 'updated';
	}

	const userWithSameEmail = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});

	if (userWithSameEmail) {
		duplicateEmails.push(driver.id);
		logImportDuplicate(externalId, userWithSameEmail.id, email);
		logger.warn(
			`Skipping driver ${driver.id} - email ${email} already exists for user ${userWithSameEmail.id}`,
		);
		return 'skipped';
	}

	logger.log(
		`Skipping driver ${driver.id} - user not found in DB (rating-only import)`,
	);
	return 'skipped';
}
