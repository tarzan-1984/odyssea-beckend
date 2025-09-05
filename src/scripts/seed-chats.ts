import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedChats() {
  console.log('🌱 Seeding chat data...');

  try {
    // Create test users
    const users = await Promise.all([
      prisma.user.upsert({
        where: { email: 'kaiya.george@example.com' },
        update: {},
        create: {
          email: 'kaiya.george@example.com',
          password: '$2b$10$example', // Hashed password
          firstName: 'Kaiya',
          lastName: 'George',
          role: 'DRIVER',
          language: ['en'],
          profilePhoto: '/images/avatars/avatar-1.jpg',
        },
      }),
      prisma.user.upsert({
        where: { email: 'lindsey.curtis@example.com' },
        update: {},
        create: {
          email: 'lindsey.curtis@example.com',
          password: '$2b$10$example',
          firstName: 'Lindsey',
          lastName: 'Curtis',
          role: 'DISPATCHER_EXPEDITE',
          language: ['en'],
          profilePhoto: '/images/avatars/avatar-2.jpg',
        },
      }),
      prisma.user.upsert({
        where: { email: 'zain.geidt@example.com' },
        update: {},
        create: {
          email: 'zain.geidt@example.com',
          password: '$2b$10$example',
          firstName: 'Zain',
          lastName: 'Geidt',
          role: 'FLEET_MANAGER',
          language: ['en'],
          profilePhoto: '/images/avatars/avatar-3.jpg',
        },
      }),
      prisma.user.upsert({
        where: { email: 'current.user@example.com' },
        update: {},
        create: {
          email: 'current.user@example.com',
          password: '$2b$10$example',
          firstName: 'Current',
          lastName: 'User',
          role: 'DRIVER',
          language: ['en'],
          profilePhoto: '/images/avatars/avatar-4.jpg',
        },
      }),
    ]);

    console.log('✅ Users created:', users.length);

    // Create chat rooms
    const chatRooms = await Promise.all([
      prisma.chatRoom.create({
        data: {
          name: 'Direct Chat',
          type: 'direct',
          isArchived: false,
          participants: {
            create: [
              { userId: users[0].id }, // Kaiya
              { userId: users[3].id }, // Current User
            ],
          },
        },
      }),
      prisma.chatRoom.create({
        data: {
          name: 'Project Discussion',
          type: 'group',
          isArchived: false,
          participants: {
            create: [
              { userId: users[1].id }, // Lindsey
              { userId: users[2].id }, // Zain
              { userId: users[3].id }, // Current User
            ],
          },
        },
      }),
      prisma.chatRoom.create({
        data: {
          name: 'Fleet Management',
          type: 'group',
          isArchived: false,
          participants: {
            create: [
              { userId: users[2].id }, // Zain
              { userId: users[3].id }, // Current User
            ],
          },
        },
      }),
      prisma.chatRoom.create({
        data: {
          name: 'Dispatch Team',
          type: 'group',
          isArchived: false,
          participants: {
            create: [
              { userId: users[1].id }, // Lindsey
              { userId: users[3].id }, // Current User
            ],
          },
        },
      }),
    ]);

    console.log('✅ Chat rooms created:', chatRooms.length);

    // Create sample messages
    const messages = await Promise.all([
      // Messages in Direct Chat (Kaiya <-> Current User)
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[0].id,
          senderId: users[0].id,
          receiverId: users[3].id,
          content: "Hey! How's the delivery going?",
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
      }),
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[0].id,
          senderId: users[3].id,
          receiverId: users[0].id,
          content: "Going great! Just finished the first stop.",
          createdAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
        },
      }),
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[0].id,
          senderId: users[0].id,
          receiverId: users[3].id,
          content: "Perfect! Keep me updated.",
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        },
      }),

      // Messages in Project Discussion
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[1].id,
          senderId: users[1].id,
          content: "I want more detailed information about the project timeline.",
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
      }),
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[1].id,
          senderId: users[3].id,
          content: "If I don't like something, I'll stay away from it.",
          createdAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
        },
      }),
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[1].id,
          senderId: users[3].id,
          content: "They got there early, and got really good seats.",
          createdAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
        },
      }),
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[1].id,
          senderId: users[2].id,
          content: "I'll prepare the detailed timeline by tomorrow.",
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        },
      }),

      // Messages in Fleet Management
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[2].id,
          senderId: users[2].id,
          content: "Fleet status update: All vehicles are operational.",
          createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        },
      }),

      // Messages in Dispatch Team
      prisma.message.create({
        data: {
          chatRoomId: chatRooms[3].id,
          senderId: users[1].id,
          content: "New delivery route assigned. Please confirm receipt.",
          createdAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
        },
      }),
    ]);

    console.log('✅ Messages created:', messages.length);

    // Add some messages with file attachments
    await prisma.message.create({
      data: {
        chatRoomId: chatRooms[1].id,
        senderId: users[1].id,
        content: "Here's the project diagram:",
        fileUrl: "https://s3.eu-central-1.wasabisys.com/tms-chat/files/87d89025-0be3-4f9b-8a88-084061d04178.txt",
        fileName: "project-diagram.jpg",
        fileSize: 1024000,
        createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      },
    });

    console.log('✅ File attachment message created');

    console.log('🎉 Chat data seeding completed successfully!');
    console.log(`Created ${users.length} users, ${chatRooms.length} chat rooms, and ${messages.length + 1} messages`);
    console.log('Current user ID:', users[3].id); // Log the current user ID

  } catch (error) {
    console.error('❌ Error seeding chat data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding
seedChats()
  .then(() => {
    console.log('✅ Seeding completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
