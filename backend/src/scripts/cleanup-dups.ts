import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[HMPanel] Checking for duplicate clients before schema migration...');
  
  try {
    const duplicates = await prisma.$queryRaw<any[]>`
      SELECT email, COUNT(*) as count 
      FROM "Client" 
      GROUP BY email 
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length > 0) {
      console.log(`[HMPanel] Found ${duplicates.length} duplicate emails. Cleaning up...`);

      for (const dup of duplicates) {
        const clients = await prisma.client.findMany({
          where: { email: dup.email },
          include: { _count: { select: { inbounds: true } } }
        });

        // Sort so clients WITH inbounds come first. If both have inbounds, keep the newest.
        clients.sort((a, b) => {
          if (b._count.inbounds !== a._count.inbounds) {
             return b._count.inbounds - a._count.inbounds;
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        });

        const validClient = clients[0];
        const clientsToDelete = clients.slice(1);

        for (const toDelete of clientsToDelete) {
          console.log(`[HMPanel] Deleting duplicate client ID ${toDelete.id} (email: ${toDelete.email}, inbounds: ${toDelete._count.inbounds})`);
          await prisma.client.delete({ where: { id: toDelete.id } });
        }
      }
      console.log('[HMPanel] Duplicate cleanup complete.');
    } else {
      console.log('[HMPanel] No duplicates found. Proceeding with migration.');
    }
  } catch (error: any) {
    console.error('[HMPanel] Warning: Error during duplicate cleanup. This may be normal if the DB is uninitialized.', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
