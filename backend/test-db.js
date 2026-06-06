const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.panel.count().then(c => console.log('Panel count:', c)).catch(console.error).finally(() => prisma.$disconnect());