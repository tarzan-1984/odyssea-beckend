import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';

export async function validateJwtUserFromPayload(
	prisma: PrismaService,
	payload: JwtPayload,
) {
	const user = await prisma.user.findUnique({
		where: { id: payload.sub },
	});

	if (!user) {
		throw new UnauthorizedException('User not found');
	}

	return {
		id: user.id,
		email: user.email,
		role: user.role,
	};
}
