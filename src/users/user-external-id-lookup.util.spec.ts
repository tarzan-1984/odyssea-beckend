import {
	isDriverParticipantRole,
	isDriverUserRole,
	participantExternalRoleKey,
	participantRoleMatchesUser,
	userWhereByExternalIdAndParticipantRole,
	userWhereDriverByExternalId,
	userWhereEmployeeByExternalId,
} from './user-external-id-lookup.util';
import { UserRole } from '@prisma/client';

describe('user-external-id-lookup.util', () => {
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

	it('maps participant role to driver or employee where clause', () => {
		expect(userWhereByExternalIdAndParticipantRole('1', 'DRIVER')).toEqual(
			userWhereDriverByExternalId('1'),
		);
		expect(
			userWhereByExternalIdAndParticipantRole('1', 'DISPATCHER'),
		).toEqual(userWhereEmployeeByExternalId('1'));
	});

	it('matches participant role category to user role', () => {
		expect(participantRoleMatchesUser('driver', 'DRIVER')).toBe(true);
		expect(participantRoleMatchesUser('DISPATCHER', 'DISPATCHER')).toBe(true);
		expect(participantRoleMatchesUser('driver', 'DISPATCHER')).toBe(false);
		expect(participantRoleMatchesUser('DISPATCHER', 'DRIVER')).toBe(false);
	});

	it('detects driver user role', () => {
		expect(isDriverUserRole('DRIVER')).toBe(true);
		expect(isDriverUserRole('dispatcher')).toBe(false);
	});

	it('builds externalId + role composite key', () => {
		expect(participantExternalRoleKey(' 3343 ', 'driver')).toBe('3343|DRIVER');
	});
});
