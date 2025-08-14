import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // Clean existing data
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  // Create test users
  const hashedPassword = await bcrypt.hash('Password123!', 10);

  const user1 = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      passwordHash: hashedPassword,
      name: 'Admin User',
      emailVerified: true,
      preferences: {
        theme: 'light',
        notifications: true,
      },
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'test@example.com',
      passwordHash: hashedPassword,
      name: 'Test User',
      emailVerified: true,
      preferences: {
        theme: 'dark',
        notifications: false,
      },
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: 'unverified@example.com',
      passwordHash: hashedPassword,
      name: 'Unverified User',
      emailVerified: false,
      emailVerificationToken: 'test-verification-token-123',
      preferences: {},
    },
  });

  console.log('Created users:', {
    user1: user1.email,
    user2: user2.email,
    user3: user3.email,
  });

  // Create a session for the admin user
  const session = await prisma.session.create({
    data: {
      userId: user1.id,
      refreshToken: 'test-refresh-token-admin',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
  });

  console.log('Created session for admin user');

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });