import { Logger } from '@nestjs/common';
import {
	LOCATION_UPDATE_FAILED_PREFIX,
	extractUserIdFromLocationPath,
	isUserLocationUpdatePath,
	logLocationUpdateFailure,
} from './location-update-failure.logger';

describe('location-update-failure.logger', () => {
	it('detects PUT /users/:id/location paths', () => {
		expect(
			isUserLocationUpdatePath('/v1/users/abc-123/location', 'PUT'),
		).toBe(true);
		expect(isUserLocationUpdatePath('/v1/users/abc/location', 'GET')).toBe(
			false,
		);
	});

	it('extracts user id from path', () => {
		expect(
			extractUserIdFromLocationPath('/v1/users/driver-uuid/location'),
		).toBe('driver-uuid');
	});

	it('logs with LOCATION_UPDATE_FAILED prefix and externalId', () => {
		const logger = new Logger('test');
		const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

		logLocationUpdateFailure(logger, {
			userId: 'user-1',
			externalId: '3343',
			source: 'geo_fence',
			httpStatus: 400,
			reason: 'Coordinates outside region',
			trace: { isManualAction: true },
		});

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const logged = String(errorSpy.mock.calls[0][0]);
		expect(logged).toContain(LOCATION_UPDATE_FAILED_PREFIX);
		expect(logged).toContain('externalId=3343');
		expect(logged).toContain('PUT /v1/users/:id/location');
		expect(logged).toContain('manual_share_or_status');

		errorSpy.mockRestore();
	});
});
