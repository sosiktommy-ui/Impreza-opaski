-- ─────────────────────────────────────────────────────────────
-- Phase 4 Foundation (additive only)
-- New enums: ScopeType, ExpenseType
-- New AuditAction values
-- New User columns: balance_*, balance_version, active_city_id, active_country_id, login_disabled
-- New Expense column: type
-- New table: user_access
-- Backfill: one UserAccess row per existing non-disabled user reflecting their legacy scope
-- ─────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('GLOBAL', 'OFFICE', 'COUNTRY', 'CITY');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('INTERNAL', 'EXTERNAL', 'THIRD');

-- AlterEnum (one ADD VALUE per statement; PG <12 safe)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCOPE_SELECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCOPE_SWITCHED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCESS_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCESS_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCESS_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BALANCE_ADJUSTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_REOPENED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_REVERSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_DISABLED_TOGGLED';

-- Sync drift from earlier hand-applied state (no-ops if already correct)
DROP INDEX IF EXISTS "inventory_entity_type_country_id_city_id_item_type_key";
ALTER TABLE "company_losses" ALTER COLUMN "total_amount" DROP DEFAULT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "type" "ExpenseType" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "active_city_id" TEXT,
ADD COLUMN "active_country_id" TEXT,
ADD COLUMN "balance_black" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "balance_blue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "balance_red" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "balance_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "balance_white" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "login_disabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_access" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "scope_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "granted_by_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "user_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_access_user_id_idx" ON "user_access"("user_id");
CREATE INDEX "user_access_user_id_scope_type_scope_id_idx" ON "user_access"("user_id", "scope_type", "scope_id");
CREATE INDEX "user_access_expires_at_idx" ON "user_access"("expires_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_active_city_id_fkey" FOREIGN KEY ("active_city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_active_country_id_fkey" FOREIGN KEY ("active_country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex (drift fixup)
ALTER INDEX "unique_inventory_entry" RENAME TO "inventory_entity_type_office_id_country_id_city_id_item_typ_key";

-- ─────────────────────────────────────────────────────────────
-- BACKFILL: one UserAccess per active legacy user, mirroring old scope.
-- Uses the earliest ADMIN as granter. Idempotent via NOT EXISTS guards.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
    granter_id TEXT;
BEGIN
    SELECT id INTO granter_id
    FROM "users"
    WHERE role = 'ADMIN' AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF granter_id IS NULL THEN
        RAISE NOTICE 'No active ADMIN found; skipping UserAccess backfill.';
        RETURN;
    END IF;

    -- ADMIN -> GLOBAL
    INSERT INTO "user_access" (id, user_id, scope_type, scope_id, granted_by_id, granted_at, notes)
    SELECT gen_random_uuid()::text, u.id, 'GLOBAL', NULL, granter_id, NOW(), 'phase4 backfill'
    FROM "users" u
    WHERE u.role = 'ADMIN'
      AND u.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM "user_access" ua
          WHERE ua.user_id = u.id AND ua.scope_type = 'GLOBAL'
      );

    -- OFFICE -> OFFICE/<office_id>
    INSERT INTO "user_access" (id, user_id, scope_type, scope_id, granted_by_id, granted_at, notes)
    SELECT gen_random_uuid()::text, u.id, 'OFFICE', u.office_id, granter_id, NOW(), 'phase4 backfill'
    FROM "users" u
    WHERE u.role = 'OFFICE'
      AND u.is_active = true
      AND u.office_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM "user_access" ua
          WHERE ua.user_id = u.id AND ua.scope_type = 'OFFICE' AND ua.scope_id = u.office_id
      );

    -- COUNTRY -> COUNTRY/<country_id>
    INSERT INTO "user_access" (id, user_id, scope_type, scope_id, granted_by_id, granted_at, notes)
    SELECT gen_random_uuid()::text, u.id, 'COUNTRY', u.country_id, granter_id, NOW(), 'phase4 backfill'
    FROM "users" u
    WHERE u.role = 'COUNTRY'
      AND u.is_active = true
      AND u.country_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM "user_access" ua
          WHERE ua.user_id = u.id AND ua.scope_type = 'COUNTRY' AND ua.scope_id = u.country_id
      );

    -- CITY -> CITY/<city_id>
    INSERT INTO "user_access" (id, user_id, scope_type, scope_id, granted_by_id, granted_at, notes)
    SELECT gen_random_uuid()::text, u.id, 'CITY', u.city_id, granter_id, NOW(), 'phase4 backfill'
    FROM "users" u
    WHERE u.role = 'CITY'
      AND u.is_active = true
      AND u.city_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM "user_access" ua
          WHERE ua.user_id = u.id AND ua.scope_type = 'CITY' AND ua.scope_id = u.city_id
      );
END $$;
