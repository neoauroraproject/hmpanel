const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany();
  console.log('Clients:', clients.map(c => ({ email: c.email, subId: c.subId })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
