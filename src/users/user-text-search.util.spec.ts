import { buildUserTextSearchWhereInput } from './user-text-search.util';

describe('buildUserTextSearchWhereInput', () => {
	it('returns null for empty search', () => {
		expect(buildUserTextSearchWhereInput('')).toBeNull();
		expect(buildUserTextSearchWhereInput('   ')).toBeNull();
	});

	it('uses OR for a single token', () => {
		expect(buildUserTextSearchWhereInput('Sasha')).toEqual({
			OR: [
				{ firstName: { contains: 'Sasha', mode: 'insensitive' } },
				{ lastName: { contains: 'Sasha', mode: 'insensitive' } },
				{ email: { contains: 'Sasha', mode: 'insensitive' } },
			],
		});
	});

	it('uses AND of OR clauses for multiple tokens', () => {
		expect(buildUserTextSearchWhereInput('Sasha Dohonov')).toEqual({
			AND: [
				{
					OR: [
						{ firstName: { contains: 'Sasha', mode: 'insensitive' } },
						{ lastName: { contains: 'Sasha', mode: 'insensitive' } },
						{ email: { contains: 'Sasha', mode: 'insensitive' } },
					],
				},
				{
					OR: [
						{ firstName: { contains: 'Dohonov', mode: 'insensitive' } },
						{ lastName: { contains: 'Dohonov', mode: 'insensitive' } },
						{ email: { contains: 'Dohonov', mode: 'insensitive' } },
					],
				},
			],
		});
	});

	it('includes phone and externalId when options are set', () => {
		expect(
			buildUserTextSearchWhereInput('12345', {
				includePhone: true,
				includeExternalId: true,
			}),
		).toEqual({
			OR: [
				{ firstName: { contains: '12345', mode: 'insensitive' } },
				{ lastName: { contains: '12345', mode: 'insensitive' } },
				{ email: { contains: '12345', mode: 'insensitive' } },
				{ phone: { not: null, contains: '12345', mode: 'insensitive' } },
				{ externalId: { not: null, contains: '12345', mode: 'insensitive' } },
			],
		});
	});

	it('adds digit-only phone matcher for formatted phone tokens', () => {
		expect(
			buildUserTextSearchWhereInput('555-123-4567', { includePhone: true }),
		).toEqual({
			OR: [
				{ firstName: { contains: '555-123-4567', mode: 'insensitive' } },
				{ lastName: { contains: '555-123-4567', mode: 'insensitive' } },
				{ email: { contains: '555-123-4567', mode: 'insensitive' } },
				{ phone: { not: null, contains: '555-123-4567', mode: 'insensitive' } },
				{ phone: { not: null, contains: '5551234567', mode: 'insensitive' } },
			],
		});
	});
});
