import { PrismaClient } from '@prisma/client';

/**
 * Test database connection script
 * This script verifies that the application can connect to the database
 * and perform basic operations
 */
async function testDatabaseConnection(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    console.log('🔌 Testing database connection...');

    // Test connection
    await prisma.$connect();
    console.log('✅ Database connection successful');

    // Test simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database query successful:', result);

    // Test User model access
    const userCount = await prisma.user.count();
    console.log('✅ User model accessible, current user count:', userCount);

    // Test database schema
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('✅ Database schema accessible, tables:', tables);

    console.log('🎉 All database tests passed!');

  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run the test
testDatabaseConnection()
  .then(() => {
    console.log('✅ Database connection test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Database connection test failed:', error);
    process.exit(1);
  });
