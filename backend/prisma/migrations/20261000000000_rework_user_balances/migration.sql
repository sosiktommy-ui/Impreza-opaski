-- ============================================================
-- REWORK: User-based balances + USER role
-- Removes COUNTRY/CITY roles, EntityType enum, Inventory table.
-- Transfers become User→User. Expenses deduct from creator.
-- Warehouse creation assigns directly to a recipient user.
-- ============================================================

-- ── Step 1: Add primary_city_id to users ──────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "primary_city_id" TEXT;

-- Migrate CITY-role users: their city_id becomes primary_city_id
UPDATE "users"
SET "primary_city_id" = "city_id"
WHERE "role"::text = 'CITY' AND "city_id" IS NOT NULL;

-- ── Step 2: Migrate CITY → USER role ──────────────────────
-- (Enum value 'USER' added in prior migration 20260999999999_add_user_role_enum_value)

-- Update CITY role users to USER
UPDATE "users" SET "role" = 'USER' WHERE "role"::text = 'CITY';

-- ── Step 3: Clear incompatible data ───────────────────────
-- Delete COUNTRY-role users (they're geo system accounts, not people)
-- Their UserAccess records cascade-delete via FK
DELETE FROM "users" WHERE "role"::text = 'COUNTRY';

-- Clear all transfers (incompatible structure — entity-based)
DELETE FROM "shortages";
DELETE FROM "company_losses";
DELETE FROM "acceptance_records";
DELETE FROM "transfer_rejections";
DELETE FROM "transfer_items";
DELETE FROM "transfers";

-- Clear adjustments (entity-based structure)
DELETE FROM "adjustments";

-- Clear warehouse creations (entity-based structure)
DELETE FROM "warehouse_creations";

-- Clear inventory table (no longer used)
DELETE FROM "inventory";

-- Clear expenses where userId is null (old expenses without creator)
DELETE FROM "expenses" WHERE "user_id" IS NULL;

-- Clear COUNTRY-scoped UserAccess records (COUNTRY scope going away)
DELETE FROM "user_access" WHERE "scope_type"::text = 'COUNTRY';

-- ── Step 4: Rebuild transfers table with new structure ─────
-- Drop old columns from transfers
ALTER TABLE "transfers"
  DROP COLUMN IF EXISTS "sender_type",
  DROP COLUMN IF EXISTS "sender_office_id",
  DROP COLUMN IF EXISTS "sender_country_id",
  DROP COLUMN IF EXISTS "sender_city_id",
  DROP COLUMN IF EXISTS "receiver_type",
  DROP COLUMN IF EXISTS "receiver_office_id",
  DROP COLUMN IF EXISTS "receiver_country_id",
  DROP COLUMN IF EXISTS "receiver_city_id";

-- Add new user-based columns
ALTER TABLE "transfers"
  ADD COLUMN IF NOT EXISTS "from_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "to_user_id" TEXT;

-- Set from_user_id = created_by (sender is whoever created the transfer)
UPDATE "transfers" SET "from_user_id" = "created_by" WHERE "from_user_id" IS NULL;

-- For any remaining nulls (orphaned) — remove them
DELETE FROM "transfers" WHERE "from_user_id" IS NULL OR "to_user_id" IS NULL;

-- Now make NOT NULL and add FKs
ALTER TABLE "transfers"
  ALTER COLUMN "from_user_id" SET NOT NULL,
  ALTER COLUMN "to_user_id" SET NOT NULL;

ALTER TABLE "transfers"
  ADD CONSTRAINT "transfers_from_user_id_fkey"
    FOREIGN KEY ("from_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "transfers_to_user_id_fkey"
    FOREIGN KEY ("to_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "transfers_from_user_id_idx" ON "transfers"("from_user_id");
CREATE INDEX IF NOT EXISTS "transfers_to_user_id_idx" ON "transfers"("to_user_id");

-- ── Step 5: Rebuild adjustments table ─────────────────────
ALTER TABLE "adjustments"
  DROP COLUMN IF EXISTS "entity_type",
  DROP COLUMN IF EXISTS "office_id",
  DROP COLUMN IF EXISTS "country_id",
  DROP COLUMN IF EXISTS "city_id";

ALTER TABLE "adjustments"
  ADD COLUMN IF NOT EXISTS "user_id" TEXT;

ALTER TABLE "adjustments"
  DROP CONSTRAINT IF EXISTS "adjustments_user_id_fkey";

ALTER TABLE "adjustments"
  ADD CONSTRAINT "adjustments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "adjustments_user_id_idx" ON "adjustments"("user_id");

-- ── Step 6: Rebuild warehouse_creations table ──────────────
ALTER TABLE "warehouse_creations"
  DROP COLUMN IF EXISTS "entity_type",
  DROP COLUMN IF EXISTS "office_id";

ALTER TABLE "warehouse_creations"
  ADD COLUMN IF NOT EXISTS "recipient_user_id" TEXT;

ALTER TABLE "warehouse_creations"
  DROP CONSTRAINT IF EXISTS "warehouse_creations_office_id_fkey",
  DROP CONSTRAINT IF EXISTS "warehouse_creations_recipient_user_id_fkey";

ALTER TABLE "warehouse_creations"
  ADD CONSTRAINT "warehouse_creations_recipient_user_id_fkey"
    FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "warehouse_creations_recipient_user_id_idx" ON "warehouse_creations"("recipient_user_id");

-- ── Step 7: Rebuild shortages table ───────────────────────
ALTER TABLE "shortages"
  DROP COLUMN IF EXISTS "entity_type",
  DROP COLUMN IF EXISTS "office_id",
  DROP COLUMN IF EXISTS "country_id",
  DROP COLUMN IF EXISTS "city_id";

ALTER TABLE "shortages"
  ADD COLUMN IF NOT EXISTS "user_id" TEXT;

ALTER TABLE "shortages"
  DROP CONSTRAINT IF EXISTS "shortages_office_id_fkey",
  DROP CONSTRAINT IF EXISTS "shortages_country_id_fkey",
  DROP CONSTRAINT IF EXISTS "shortages_city_id_fkey",
  DROP CONSTRAINT IF EXISTS "shortages_user_id_fkey";

ALTER TABLE "shortages"
  ADD CONSTRAINT "shortages_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "shortages_user_id_idx" ON "shortages"("user_id");

-- ── Step 8: Expenses — userId NOT NULL, remove old columns ─
ALTER TABLE "expenses"
  DROP COLUMN IF EXISTS "target_city_id",
  DROP COLUMN IF EXISTS "actor_user_id";

-- Add FK on user_id for expenses
ALTER TABLE "expenses"
  DROP CONSTRAINT IF EXISTS "expenses_user_id_fkey";

ALTER TABLE "expenses"
  ALTER COLUMN "user_id" SET NOT NULL,
  ADD CONSTRAINT "expenses_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "expenses_user_id_idx" ON "expenses"("user_id");

-- ── Step 9: Company losses — remove old denormalized city cols
ALTER TABLE "company_losses"
  DROP COLUMN IF EXISTS "sender_city",
  DROP COLUMN IF EXISTS "receiver_city";

-- ── Step 10: Users — remove old scope columns ──────────────
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "city_id",
  DROP COLUMN IF EXISTS "country_id",
  DROP COLUMN IF EXISTS "active_city_id",
  DROP COLUMN IF EXISTS "active_country_id";

-- Add FK for primary_city_id
ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_primary_city_id_fkey";

ALTER TABLE "users"
  ADD CONSTRAINT "users_primary_city_id_fkey"
    FOREIGN KEY ("primary_city_id") REFERENCES "cities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "users_primary_city_id_idx" ON "users"("primary_city_id");

-- ── Step 11: Rebuild ScopeType enum ───────────────────────
-- Add CITY value if not exists (it should already exist)
-- Remove COUNTRY from enum — PostgreSQL requires recreating the enum
-- We do this by changing the column type via a cast

-- First update any remaining COUNTRY scope accesses (should be none after delete above)
UPDATE "user_access" SET "scope_type" = 'CITY' WHERE "scope_type"::text = 'COUNTRY';

-- Create new ScopeType without COUNTRY
CREATE TYPE "ScopeType_new" AS ENUM ('GLOBAL', 'OFFICE', 'CITY');

-- Migrate user_access table
ALTER TABLE "user_access"
  ALTER COLUMN "scope_type" TYPE "ScopeType_new"
  USING "scope_type"::text::"ScopeType_new";

-- Drop old enum and rename new one
DROP TYPE "ScopeType";
ALTER TYPE "ScopeType_new" RENAME TO "ScopeType";

-- ── Step 12: Rebuild Role enum ─────────────────────────────
-- Remove COUNTRY and CITY values from Role enum
-- (USER was added in step 2, ADMIN and OFFICE already exist)
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'OFFICE', 'USER');

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role_new"
  USING "role"::text::"Role_new";

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- ── Step 13: Drop old tables / unused indexes ──────────────
DROP TABLE IF EXISTS "inventory";

-- Drop old indexes that referenced removed columns
DROP INDEX IF EXISTS "transfers_sender_type_sender_office_id_idx";
DROP INDEX IF EXISTS "transfers_sender_type_sender_country_id_idx";
DROP INDEX IF EXISTS "transfers_sender_type_sender_city_id_idx";
DROP INDEX IF EXISTS "transfers_receiver_type_receiver_office_id_idx";
DROP INDEX IF EXISTS "transfers_receiver_type_receiver_country_id_idx";
DROP INDEX IF EXISTS "transfers_receiver_type_receiver_city_id_idx";
DROP INDEX IF EXISTS "adjustments_entity_type_office_id_idx";
DROP INDEX IF EXISTS "adjustments_entity_type_country_id_idx";
DROP INDEX IF EXISTS "adjustments_entity_type_city_id_idx";
DROP INDEX IF EXISTS "shortages_entity_type_office_id_idx";
DROP INDEX IF EXISTS "shortages_entity_type_country_id_idx";
DROP INDEX IF EXISTS "shortages_entity_type_city_id_idx";
DROP INDEX IF EXISTS "warehouse_creations_entity_type_office_id_idx";

-- Drop EntityType enum (no longer used anywhere)
DROP TYPE IF EXISTS "EntityType";

-- ── Step 14: UserAccess FK for primary_city_id ─────────────
-- USER role users automatically get a CITY-scoped access during seed/creation
-- Existing CITY-scoped accesses are already correct

-- ── Step 15: Add tracking columns to transfers ────────────
ALTER TABLE "transfers"
  ADD COLUMN IF NOT EXISTS "accepted_by"       TEXT,
  ADD COLUMN IF NOT EXISTS "rejected_at"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "rejected_by"       TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_at"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "cancelled_by"      TEXT,
  ADD COLUMN IF NOT EXISTS "resolved_at"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "resolved_by"       TEXT,
  ADD COLUMN IF NOT EXISTS "discrepancy_notes" TEXT;

-- ── Done ───────────────────────────────────────────────────
