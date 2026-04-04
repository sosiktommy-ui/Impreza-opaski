/**
 * IMPREZA — Database Cleanup Script
 *
 * Clears all operational data while preserving structure:
 *  - Transfers + related records (items, acceptances, rejections)
 *  - Company losses & account shortages
 *  - Warehouse creations
 *  - Chat messages
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

  // 6. Delete company losses (FK → Transfer) — may not exist if migration not applied
  try {
    const companyLossCount = await (prisma as any).companyLoss.deleteMany({});
    console.log(`   ✅ CompanyLosses: ${companyLossCount.count} deleted`);
  } catch { console.log('   ⏭️  CompanyLosses: table does not exist, skipped'); }

  // 7. Delete shortages (FK → Transfer)
  try {
    const shortageCount = await (prisma as any).shortage.deleteMany({});
    console.log(`   ✅ Shortages: ${shortageCount.count} deleted`);
  } catch { console.log('   ⏭️  Shortages: table does not exist, skipped'); }

  // 8. Delete transfers
  const transfersCount = await prisma.transfer.deleteMany({});
  console.log(`   ✅ Transfers: ${transfersCount.count} deleted`);

  // 9. Delete warehouse creations
  try {
    const warehouseCount = await (prisma as any).warehouseCreation.deleteMany({});
    console.log(`   ✅ WarehouseCreations: ${warehouseCount.count} deleted`);
  } catch { console.log('   ⏭️  WarehouseCreations: table does not exist, skipped'); }

  // 10. Delete chat messages
  try {
    const chatCount = await (prisma as any).chatMessage.deleteMany({});
    console.log(`   ✅ ChatMessages: ${chatCount.count} deleted`);
  } catch { console.log('   ⏭️  ChatMessages: table does not exist, skipped'); }

  // 11. Delete expenses
  const expensesCount = await prisma.expense.deleteMany({});
  console.log(`   ✅ Expenses: ${expensesCount.count} deleted`);

  // 12. Delete notifications
  const notifCount = await prisma.notification.deleteMany({});
  console.log(`   ✅ Notifications: ${notifCount.count} deleted`);

  // 13. Delete adjustments
  const adjCount = await prisma.adjustment.deleteMany({});
  console.log(`   ✅ Adjustments: ${adjCount.count} deleted`);

  // 14. Set all inventory quantities to 0
  const invCount = await prisma.inventory.updateMany({
    data: { quantity: 0 },
  });
  console.log(`   ✅ Inventory: ${invCount.count} rows set to quantity=0`);

  // 15. Reset all city statuses to ACTIVE
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
