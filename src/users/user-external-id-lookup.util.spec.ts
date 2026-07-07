import {
	isDriverParticipantRole,
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
});
