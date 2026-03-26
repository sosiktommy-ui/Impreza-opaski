import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== CHECKING PROBLEMATIC TRANSFERS ===\n');
  
  // Count all transfers by status
  const statusCounts = await prisma.$queryRaw`
    SELECT status, COUNT(*)::int as count 
    FROM "Transfer" 
    GROUP BY status
  `;
  console.log('Transfer counts by status:', statusCounts);
  
  // Get problematic transfers
  const problematic = await prisma.transfer.findMany({
    where: { status: 'DISCREPANCY_FOUND' },
    select: {
      id: true,
      status: true,
      senderType: true,
      receiverType: true,
      senderCountryId: true,
      senderCityId: true,
      receiverCountryId: true,
      receiverCityId: true,
      createdAt: true,
    },
    take: 10,
  });
  
  console.log('\nProblematic transfers (DISCREPANCY_FOUND):');
  console.log(JSON.stringify(problematic, null, 2));
  console.log(`\nTotal problematic: ${problematic.length}`);
  
  // Check if badge count query would return anything
  const total = await prisma.transfer.count({
    where: { status: 'DISCREPANCY_FOUND' },
  });
  console.log(`\nTotal DISCREPANCY_FOUND count: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
