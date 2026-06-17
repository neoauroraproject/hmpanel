import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const clients = await prisma.client.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { admin: true }
  });
  console.log(JSON.stringify(clients, null, 2));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
