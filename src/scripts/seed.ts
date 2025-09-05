import {
  PrismaClient,
  UserRole,
  UserStatus,
  VehicleType,
  DistanceCoverage,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@odyssea.com' },
    update: {},
    create: {
      email: 'admin@odyssea.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      phone: '+1234567890',
      language: ['English'],
      extension: '100',
    },
  });

  // Create additional admin user
  const tdevPassword = await bcrypt.hash('Passcode456!', 12);
  const tdevAdmin = await prisma.user.upsert({
    where: { email: 'tdev13103@gmail.com' },
    update: {},
    create: {
      email: 'tdev13103@gmail.com',
      password: tdevPassword,
      firstName: 'TDev',
      lastName: 'Admin',
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      phone: '+1234567895',
      language: ['English'],
      extension: '104',
    },
  });

  // Create dispatcher user
  const dispatcherPassword = await bcrypt.hash('dispatcher123', 12);
  const dispatcher = await prisma.user.upsert({
    where: { email: 'dispatcher@odyssea.com' },
    update: {},
    create: {
      email: 'dispatcher@odyssea.com',
      password: dispatcherPassword,
      firstName: 'John',
      lastName: 'Dispatcher',
      role: UserRole.DISPATCHER_EXPEDITE,
      status: UserStatus.ACTIVE,
      phone: '+1234567891',
      language: ['English', 'Spanish'],
      extension: '101',
    },
  });

  // Create driver user
  const driverPassword = await bcrypt.hash('driver123', 12);
  const driver = await prisma.user.upsert({
    where: { email: 'driver@odyssea.com' },
    update: {},
    create: {
      email: 'driver@odyssea.com',
      password: driverPassword,
      firstName: 'Mike',
      lastName: 'Driver',
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
      phone: '+1234567892',
      language: ['English'],
      vehicleType: VehicleType.SPRINTER_VAN,
      vehicleCapacity: '2000 lbs',
      vehicleDimensions: '10x8x6 feet',
      vehicleModel: 'Sprinter 2500',
      vehicleBrand: 'Mercedes-Benz',
      vehicleYear: 2020,
      distanceCoverage: DistanceCoverage.REGIONAL,
      hasCDL: true,
      hasTWIC: true,
      hasLiftGate: true,
      hasPalletJack: true,
      hasCanada: true,
      hasMexico: false,
      hasETracks: true,
      hasLoadBars: true,
      hasRamp: true,
      hasDockHigh: true,
      hasPPE: true,
      hasRealID: true,
      hasPrinter: false,
      hasSleeper: false,
    },
  });

  // Create recruiter user
  const recruiterPassword = await bcrypt.hash('recruiter123', 12);
  const recruiter = await prisma.user.upsert({
    where: { email: 'recruiter@odyssea.com' },
    update: {},
    create: {
      email: 'recruiter@odyssea.com',
      password: recruiterPassword,
      firstName: 'Sarah',
      lastName: 'Recruiter',
      role: UserRole.RECRUITER,
      status: UserStatus.ACTIVE,
      phone: '+1234567893',
      language: ['English'],
      extension: '102',
    },
  });

  // Create tracking user
  const trackingPassword = await bcrypt.hash('tracking123', 12);
  const tracking = await prisma.user.upsert({
    where: { email: 'tracking@odyssea.com' },
    update: {},
    create: {
      email: 'tracking@odyssea.com',
      password: trackingPassword,
      firstName: 'Alex',
      lastName: 'Tracking',
      role: UserRole.TRACKING,
      status: UserStatus.ACTIVE,
      phone: '+1234567894',
      language: ['English'],
      extension: '103',
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log('📋 Created users:');
  console.log(`   Admin: ${admin.email} (password: admin123)`);
  console.log(`   TDev Admin: ${tdevAdmin.email} (password: Passcode456!)`);
  console.log(`   Dispatcher: ${dispatcher.email} (password: dispatcher123)`);
  console.log(`   Driver: ${driver.email} (password: driver123)`);
  console.log(`   Recruiter: ${recruiter.email} (password: recruiter123)`);
  console.log(`   Tracking: ${tracking.email} (password: tracking123)`);
}

void main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
