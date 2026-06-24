const { PrismaClient } = require('../../node_modules/.prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://panel_user:panel_pass@localhost:5432/panel_db?schema=public' } }
});
async function main() {
  const panels = await prisma.panel.findMany({
    select: { id: true, name: true, url: true, apiBaseUrl: true, apiToken: true, authMode: true, status: true, version: true, capClientsApi: true, panelType: true }
  });
  console.log(JSON.stringify(panels, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
