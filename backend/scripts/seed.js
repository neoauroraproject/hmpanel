// DEV-ONLY local bootstrap. Never run in production — wipes the database.
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run seed in production.');
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

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

  await prisma.admin.create({
    data: {
      username: 'superadmin',
      email: 'super@panel.dev',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'SUPER_ADMIN',
      balance: 0,
      status: 'active',
    },
  });

  await prisma.server.create({
    data: {
      name: 'Default Server',
      ipAddress: '127.0.0.1',
      status: 'active',
    },
  });

  console.log('Dev seed complete: superadmin + default server (local only).');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
