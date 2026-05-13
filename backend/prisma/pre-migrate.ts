/**
 * pre-migrate.ts
 *
 * Runs BEFORE prisma db push. Handles data transformations that would block
 * the schema migration (enum changes, NOT NULL column additions, etc.)
 *
 * Specifically handles the USER-centric refactor:
 *  - Adds USER to Role enum (so CITY users can be migrated)
 *  - Converts CITY-role users → USER
 *  - Deletes COUNTRY-role users
 *  - Updates COUNTRY scope_type → CITY in user_access
 *  - Clears tables that have structurally incompatible rows
 *    (transfers with entity-based columns, adjustments without user_id, etc.)
 *    These tables are re-seeded by seed.ts after db push.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1
     ) AS exists`,
    name,
  );
  return result[0]?.exists ?? false;
}

async function main() {
  console.log('[pre-migrate] Starting pre-migration data transformation...');

  // ── Step 1: Add USER value to Role enum ──────────────────────────────────
  // ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
  // $executeRawUnsafe is auto-committed (no wrapping transaction), so it works.
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'USER'`,
    );
    console.log('[pre-migrate] ✓ USER value ensured in Role enum');
  } catch (err: any) {
    // Ignore "already exists" errors; rethrow anything else
    if (!String(err?.message).includes('already exists')) {
      throw err;
    }
    console.log('[pre-migrate] ✓ Role.USER already present');
  }

  // ── Step 2: Copy city_id → primary_city_id for CITY-role users ──────────
  if (await tableExists('users')) {
    const hasCityId = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'users' AND column_name = 'city_id'
       ) AS exists`,
    );
    if (hasCityId[0]?.exists) {
      // Ensure primary_city_id column exists (it may already from a previous partial run)
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "primary_city_id" UUID`,
      );
      await prisma.$executeRawUnsafe(`
        UPDATE "users"
        SET "primary_city_id" = "city_id"
        WHERE "role"::text = 'CITY'
          AND "city_id" IS NOT NULL
          AND "primary_city_id" IS NULL
      `);
      console.log('[pre-migrate] ✓ Copied city_id → primary_city_id for CITY users');
    }
  }

  // ── Step 3: Convert CITY-role users → USER ───────────────────────────────
  const converted = await prisma.$executeRawUnsafe(
    `UPDATE "users" SET "role" = 'USER' WHERE "role"::text = 'CITY'`,
  );
  console.log(`[pre-migrate] ✓ Converted ${converted} CITY user(s) to USER`);

  // ── Step 4: Delete COUNTRY-role users ────────────────────────────────────
  // Their UserAccess rows cascade-delete via FK.
  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "role"::text = 'COUNTRY'`,
  );
  console.log(`[pre-migrate] ✓ Deleted ${deleted} COUNTRY user(s)`);

  // ── Step 5: Update COUNTRY scope_type → CITY in user_access ─────────────
  if (await tableExists('user_access')) {
    await prisma.$executeRawUnsafe(
      `UPDATE "user_access" SET "scope_type" = 'CITY' WHERE "scope_type"::text = 'COUNTRY'`,
    );
    console.log('[pre-migrate] ✓ COUNTRY scopes → CITY in user_access');
  }

  // ── Step 6: Clear tables with incompatible structure ─────────────────────
  // These tables are fully rebuilt by seed.ts after db push.
  // We clear them now so db push can safely add NOT NULL columns.
  const toTruncate = [
    'acceptance_records',
    'transfer_rejections',
    'company_losses',
    'shortages',
    'adjustments',
    'expenses',
    'warehouse_creations',
    'transfer_items',
    'transfers',
    'notifications',
    'audit_logs',
    'domain_events',
  ];

  const existing = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const existingSet = new Set(existing.map((r: any) => r.tablename));
  const targets = toTruncate.filter((t) => existingSet.has(t));

  if (targets.length > 0) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${targets.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    console.log(`[pre-migrate] ✓ Cleared ${targets.length} tables: ${targets.join(', ')}`);
  }

  console.log('[pre-migrate] ✓ Pre-migration complete — ready for prisma db push');
}

main()
  .catch((e) => {
    console.error('[pre-migrate] FATAL:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
