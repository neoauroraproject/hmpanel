const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.server.findFirst();
  if (!existing) {
    await prisma.server.create({
      data: {
        name: 'Main Server',
        ipAddress: '127.0.0.1',
        status: 'active'
      }
    });
    console.log('Created Main Server');
  } else {
    console.log('Server already exists');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
