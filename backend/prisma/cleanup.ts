/**
 * IMPREZA — Database Cleanup Script
 *
 * Clears all operational data while preserving structure:
 *  - Transfers + related records (items, acceptances, rejections)
 *  - Expenses
 *  - Notifications
 *  - Adjustments
 *  - Domain events & audit logs
 *  - Sets all inventory quantities to 0
 *  - Resets city statuses to ACTIVE
 *
 * Run: npx tsx prisma/cleanup.ts
 */

import { PrismaClient, CityStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 IMPREZA Database Cleanup\n');

  // 1. Delete acceptance records (FK → Transfer)
  const acceptanceCount = await prisma.acceptanceRecord.deleteMany({});
  console.log(`   ✅ AcceptanceRecords: ${acceptanceCount.count} deleted`);

  // 2. Delete transfer rejections (FK → Transfer)
  const rejectionsCount = await prisma.transferRejection.deleteMany({});
  console.log(`   ✅ TransferRejections: ${rejectionsCount.count} deleted`);

  // 3. Delete transfer items (FK → Transfer)
  const itemsCount = await prisma.transferItem.deleteMany({});
  console.log(`   ✅ TransferItems: ${itemsCount.count} deleted`);

  // 4. Delete domain events
  const eventsCount = await prisma.domainEvent.deleteMany({});
  console.log(`   ✅ DomainEvents: ${eventsCount.count} deleted`);

  // 5. Delete audit logs
  const auditCount = await prisma.auditLog.deleteMany({});
  console.log(`   ✅ AuditLogs: ${auditCount.count} deleted`);

  // 6. Delete transfers
  const transfersCount = await prisma.transfer.deleteMany({});
  console.log(`   ✅ Transfers: ${transfersCount.count} deleted`);

  // 7. Delete expenses
  const expensesCount = await prisma.expense.deleteMany({});
  console.log(`   ✅ Expenses: ${expensesCount.count} deleted`);

  // 8. Delete notifications
  const notifCount = await prisma.notification.deleteMany({});
  console.log(`   ✅ Notifications: ${notifCount.count} deleted`);

  // 9. Delete adjustments
  const adjCount = await prisma.adjustment.deleteMany({});
  console.log(`   ✅ Adjustments: ${adjCount.count} deleted`);

  // 10. Set all inventory quantities to 0
  const invCount = await prisma.inventory.updateMany({
    data: { quantity: 0 },
  });
  console.log(`   ✅ Inventory: ${invCount.count} rows set to quantity=0`);

  // 11. Reset all city statuses to ACTIVE
  const cityCount = await prisma.city.updateMany({
    data: { status: CityStatus.ACTIVE },
  });
  console.log(`   ✅ Cities: ${cityCount.count} reset to ACTIVE`);

  console.log('\n✅ Cleanup complete! All operational data cleared.');
}

main()
  .catch((e) => {
    console.error('❌ Cleanup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
