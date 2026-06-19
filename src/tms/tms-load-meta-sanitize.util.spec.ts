import {
	sanitizeMobileDriverLoadsResponse,
	sanitizeMobileLoadDetailsResponse,
	sanitizeMobileLoadMeta,
} from './tms-load-meta-sanitize.util';

describe('tms-load-meta-sanitize.util', () => {
	it('always clears booked_rate', () => {
		expect(
			sanitizeMobileLoadMeta(
				{ booked_rate: '1500', load_type: 'ltl', source: 'dat', profit: '200' },
				{ forDriver: false },
			),
		).toEqual({
			booked_rate: '',
			load_type: 'ltl',
			source: 'dat',
			profit: '200',
		});
	});

	it('clears driver-only fields when forDriver is true', () => {
		expect(
			sanitizeMobileLoadMeta(
				{ booked_rate: '1500', load_type: 'ltl', source: 'dat', profit: '200' },
				{ forDriver: true },
			),
		).toEqual({
			booked_rate: '',
			load_type: '',
			source: '',
			profit: '',
		});
	});

	it('sanitizes nested driver loads response', () => {
		const input = {
			success: true,
			data: {
				loads: [
					{
						id: '1',
						meta_data: {
							booked_rate: '1500',
							load_type: 'ltl',
							source: 'dat',
							profit: '200',
							reference_number: '253457',
						},
					},
				],
			},
		};

		expect(sanitizeMobileDriverLoadsResponse(input, { forDriver: true })).toEqual({
			success: true,
			data: {
				loads: [
					{
						id: '1',
						meta_data: {
							booked_rate: '',
							load_type: '',
							source: '',
							profit: '',
							reference_number: '253457',
						},
					},
				],
			},
		});
	});

	it('sanitizes load details response', () => {
		const input = {
			success: true,
			data: {
				meta_data: {
					booked_rate: '1500',
					load_type: 'ltl',
				},
			},
		};

		expect(
			sanitizeMobileLoadDetailsResponse(input, { forDriver: true }),
		).toEqual({
			success: true,
			data: {
				meta_data: {
					booked_rate: '',
					load_type: '',
					source: '',
					profit: '',
				},
			},
		});
	});
});
