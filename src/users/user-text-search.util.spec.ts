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
});
