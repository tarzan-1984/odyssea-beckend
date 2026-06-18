import { buildArchivedLoadChatSearchWhereInput } from './chat-room-search.util';

describe('buildArchivedLoadChatSearchWhereInput', () => {
	it('returns null for empty search', () => {
		expect(buildArchivedLoadChatSearchWhereInput('')).toBeNull();
		expect(buildArchivedLoadChatSearchWhereInput('   ')).toBeNull();
	});

	it('matches room name and loadId', () => {
		expect(buildArchivedLoadChatSearchWhereInput('23267')).toEqual({
			OR: [
				{ name: { contains: '23267', mode: 'insensitive' } },
				{ loadId: { contains: '23267', mode: 'insensitive' } },
				{
					participants: {
						some: {
							isHidden: false,
							user: {
								OR: [
									{ firstName: { contains: '23267', mode: 'insensitive' } },
									{ lastName: { contains: '23267', mode: 'insensitive' } },
									{ email: { contains: '23267', mode: 'insensitive' } },
									{
										phone: {
											not: null,
											contains: '23267',
											mode: 'insensitive',
										},
									},
									{
										externalId: {
											not: null,
											contains: '23267',
											mode: 'insensitive',
										},
									},
								],
							},
						},
					},
				},
			],
		});
	});
});
