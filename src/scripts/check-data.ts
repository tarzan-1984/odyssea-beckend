import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
	console.log('🔍 Checking database data...');

	try {
		// Check users
		const users = await prisma.user.findMany({
			select: { id: true, email: true, firstName: true, lastName: true },
		});
		console.log('Users:', users);

		// Check chat rooms
		const chatRooms = await prisma.chatRoom.findMany({
			select: { id: true, name: true, type: true },
		});
		console.log('Chat Rooms:', chatRooms);

		// Check participants
		const participants = await prisma.chatRoomParticipant.findMany({
			select: {
				id: true,
				chatRoomId: true,
				userId: true,
				chatRoom: { select: { name: true } },
				user: { select: { firstName: true, lastName: true } },
			},
		});
		console.log('Participants:', participants);

		// Check messages
		const messages = await prisma.message.findMany({
			select: {
				id: true,
				chatRoomId: true,
				content: true,
				senderId: true,
			},
		});
		console.log('Messages:', messages);
	} catch (error) {
		console.error('❌ Error checking data:', error);
	} finally {
		await prisma.$disconnect();
	}
}

void checkData();
