// Demo seed data. Run with DATABASE_URL set (see backend/.env).
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const GB = (n) => BigInt(Math.round(n)) * 1024n * 1024n * 1024n;
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysFromNow = (d) => BigInt(now + d * DAY);
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];

async function main() {
  // Clean slate (child -> parent order)
  await prisma.trafficTransaction.deleteMany();
  await prisma.adminInbound.deleteMany();
  await prisma.client.deleteMany();
  await prisma.trafficPool.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.backup.deleteMany();
  await prisma.syncState.deleteMany();
  await prisma.systemStats.deleteMany();
  await prisma.inbound.deleteMany();
  await prisma.panel.deleteMany();
  await prisma.server.deleteMany();
  await prisma.admin.deleteMany();

  // --- Admins ---
  const superAdmin = await prisma.admin.create({
    data: {
      username: 'superadmin', email: 'super@panel.dev',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'SUPER_ADMIN', balance: 0, status: 'active',
    },
  });

  // --- Infrastructure ---
  const defaultServer = await prisma.server.create({
    data: {
      name: 'Default Server',
      ipAddress: '127.0.0.1',
      status: 'active',
    },
  });

  console.log('Seed complete: cleaned database, seeded superadmin and default server');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
