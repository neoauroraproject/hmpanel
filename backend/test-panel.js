const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.panel.findFirst().then(p => console.log(JSON.stringify(p))).catch(console.error).finally(() => prisma.$disconnect());
