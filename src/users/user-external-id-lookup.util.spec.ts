import {
	AmbiguousExternalIdError,
	ExternalIdRoleRequiredError,
	findSingleUserByExternalIdAndParticipantRole,
	isDriverParticipantRole,
	isDriverUserRole,
	normalizeParticipantRole,
	participantExternalRoleKey,
	participantRoleCategoryKey,
	participantRoleMatchesUser,
	resolveUserRoleFromParticipantRole,
	userExternalRoleKey,
	userRoleCategoryKey,
	userWhereByExternalIdAndParticipantRole,
	userWhereDriverByExternalId,
	userWhereEmployeeByExternalId,
} from './user-external-id-lookup.util';
import { UserRole } from '@prisma/client';

describe('user-external-id-lookup.util', () => {
	it('normalizes TMS roles to UserRole-shaped keys', () => {
		expect(normalizeParticipantRole('tracking-tl')).toBe('TRACKING_TL');
		expect(normalizeParticipantRole(' nightshift_tracking ')).toBe(
			'NIGHTSHIFT_TRACKING',
		);
		expect(resolveUserRoleFromParticipantRole('tracking-tl')).toBe(
			UserRole.TRACKING_TL,
		);
	});

	it('detects driver participant role case-insensitively', () => {
		expect(isDriverParticipantRole('DRIVER')).toBe(true);
		expect(isDriverParticipantRole('driver')).toBe(true);
		expect(isDriverParticipantRole('DISPATCHER')).toBe(false);
	});

	it('builds driver where clause', () => {
		expect(userWhereDriverByExternalId(' 2465 ')).toEqual({
			externalId: '2465',
			role: UserRole.DRIVER,
		});
	});

	it('builds employee where clause', () => {
		expect(userWhereEmployeeByExternalId('2465')).toEqual({
			externalId: '2465',
			role: { not: UserRole.DRIVER },
		});
	});

	it('maps non-driver participant role to employee where (no exact role match)', () => {
		expect(userWhereByExternalIdAndParticipantRole('1', 'DRIVER')).toEqual(
			userWhereDriverByExternalId('1'),
		);
		expect(
			userWhereByExternalIdAndParticipantRole('1', 'dispatcher'),
		).toEqual(userWhereEmployeeByExternalId('1'));
		expect(
			userWhereByExternalIdAndParticipantRole('77', 'tracking-tl'),
		).toEqual(userWhereEmployeeByExternalId('77'));
		expect(
			userWhereByExternalIdAndParticipantRole('1', 'custom_role'),
		).toEqual(userWhereEmployeeByExternalId('1'));
	});

	it('matches participant role by DRIVER vs non-DRIVER category only', () => {
		expect(participantRoleMatchesUser('driver', 'DRIVER')).toBe(true);
		expect(participantRoleMatchesUser('DISPATCHER', 'DISPATCHER')).toBe(true);
		expect(participantRoleMatchesUser('tracking-tl', 'TRACKING_TL')).toBe(
			true,
		);
		expect(participantRoleMatchesUser('dispatcher', 'DISPATCHER_TL')).toBe(
			true,
		);
		expect(participantRoleMatchesUser('tracking', 'NIGHTSHIFT_TRACKING')).toBe(
			true,
		);
		expect(participantRoleMatchesUser('driver', 'DISPATCHER')).toBe(false);
		expect(participantRoleMatchesUser('DISPATCHER', 'DRIVER')).toBe(false);
	});

	it('detects driver user role', () => {
		expect(isDriverUserRole('DRIVER')).toBe(true);
		expect(isDriverUserRole('dispatcher')).toBe(false);
	});

	it('builds externalId + role composite key', () => {
		expect(participantExternalRoleKey(' 3343 ', 'driver')).toBe('3343|DRIVER');
		expect(participantExternalRoleKey('77', 'tracking-tl')).toBe(
			'77|TRACKING_TL',
		);
		expect(userExternalRoleKey('77', 'TRACKING_TL')).toBe('77|TRACKING_TL');
	});

	it('builds externalId + role category key', () => {
		expect(participantRoleCategoryKey('3343', 'dispatcher')).toBe(
			'3343|EMPLOYEE',
		);
		expect(userRoleCategoryKey('3343', 'TRACKING')).toBe('3343|EMPLOYEE');
		expect(userRoleCategoryKey('3343', 'DRIVER')).toBe('3343|DRIVER');
	});

	it('findSingleUserByExternalIdAndParticipantRole requires role', async () => {
		const prisma = { user: { findMany: jest.fn() } };
		await expect(
			findSingleUserByExternalIdAndParticipantRole(
				prisma as any,
				'3343',
				'',
				{ id: true },
			),
		).rejects.toBeInstanceOf(ExternalIdRoleRequiredError);
	});

	it('findSingleUserByExternalIdAndParticipantRole throws on ambiguous matches', async () => {
		const prisma = {
			user: {
				findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
			},
		};
		await expect(
			findSingleUserByExternalIdAndParticipantRole(
				prisma as any,
				'3343',
				'DRIVER',
				{ id: true },
			),
		).rejects.toBeInstanceOf(AmbiguousExternalIdError);
	});

	it('findSingleUserByExternalIdAndParticipantRole returns single match', async () => {
		const prisma = {
			user: {
				findMany: jest.fn().mockResolvedValue([{ id: 'driver-1' }]),
			},
		};
		await expect(
			findSingleUserByExternalIdAndParticipantRole(
				prisma as any,
				'3343',
				'driver',
				{ id: true },
			),
		).resolves.toEqual({ id: 'driver-1' });
	});
});
