import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@odyssea.com' },
    update: {},
    create: {
      email: 'admin@odyssea.com',
      username: 'admin',
      password: '$2b$10$example.hash.for.password', // In real app, hash the password
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('✅ Database seeded successfully');
  console.log('👤 Admin user created:', adminUser.email);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
