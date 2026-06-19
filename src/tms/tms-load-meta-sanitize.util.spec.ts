import {
	sanitizeMobileDriverLoadsResponse,
	sanitizeMobileLoadDetailsResponse,
	sanitizeMobileLoadMeta,
} from './tms-load-meta-sanitize.util';

describe('tms-load-meta-sanitize.util', () => {
	it('always clears booked_rate and all Documents tab fields', () => {
		expect(
			sanitizeMobileLoadMeta(
				{
					booked_rate: '1500',
					proof_of_delivery: '111',
					updated_rate_confirmation: '222',
					screen_picture: '333',
					freight_pictures: '[444,445]',
					attached_files: '[52614,52615]',
					load_type: 'ltl',
					source: 'dat',
					profit: '200',
				},
				{ forDriver: false },
			),
		).toEqual({
			booked_rate: '',
			proof_of_delivery: '',
			updated_rate_confirmation: '',
			screen_picture: '',
			freight_pictures: [],
			attached_files: [],
			load_type: 'ltl',
			source: 'dat',
			profit: '200',
		});
	});

	it('clears driver-only fields when forDriver is true', () => {
		expect(
			sanitizeMobileLoadMeta(
				{
					booked_rate: '1500',
					proof_of_delivery: '111',
					freight_pictures: '[444]',
					attached_files: '[52614]',
					load_type: 'ltl',
					source: 'dat',
					profit: '200',
				},
				{ forDriver: true },
			),
		).toEqual({
			booked_rate: '',
			proof_of_delivery: '',
			updated_rate_confirmation: '',
			screen_picture: '',
			freight_pictures: [],
			attached_files: [],
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
							attached_files: '[52614]',
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
							proof_of_delivery: '',
							updated_rate_confirmation: '',
							screen_picture: '',
							freight_pictures: [],
							attached_files: [],
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
					proof_of_delivery: '111',
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
					proof_of_delivery: '',
					load_type: '',
					source: '',
					profit: '',
					freight_pictures: [],
					attached_files: [],
					updated_rate_confirmation: '',
					screen_picture: '',
				},
			},
		});
	});
});
