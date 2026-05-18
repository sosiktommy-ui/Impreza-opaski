-- Ensure balances_redesign columns exist (idempotent patch)
-- This migration exists in case 20270517000000_balances_redesign was already
-- registered in _prisma_migrations but failed partially on the live DB.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransferKind') THEN
    CREATE TYPE "TransferKind" AS ENUM ('PEER', 'DISTRIBUTION', 'ALLOCATION');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WarehouseTargetKind') THEN
    CREATE TYPE "WarehouseTargetKind" AS ENUM ('ADMIN_SELF', 'OFFICE');
  END IF;
END $$;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'OFFICE_SELF_MINT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISTRIBUTION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ALLOCATION_RECEIVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WAREHOUSE_MINT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OFFICE_SELF_MINT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DISTRIBUTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ALLOCATION_CREATED';

ALTER TABLE "offices" ADD COLUMN IF NOT EXISTS "balance_black"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "offices" ADD COLUMN IF NOT EXISTS "balance_white"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "offices" ADD COLUMN IF NOT EXISTS "balance_red"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "offices" ADD COLUMN IF NOT EXISTS "balance_blue"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "offices" ADD COLUMN IF NOT EXISTS "balance_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "kind"           "TransferKind" NOT NULL DEFAULT 'PEER';
ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "from_office_id" TEXT;
ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "to_office_id"   TEXT;
ALTER TABLE "transfers" ALTER COLUMN "from_user_id" DROP NOT NULL;
ALTER TABLE "transfers" ALTER COLUMN "to_user_id"   DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_from_office_id_fkey') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_office_id_fkey"
      FOREIGN KEY ("from_office_id") REFERENCES "offices"("id") ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_to_office_id_fkey') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_office_id_fkey"
      FOREIGN KEY ("to_office_id") REFERENCES "offices"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "transfers_kind_idx"           ON "transfers" ("kind");
CREATE INDEX IF NOT EXISTS "transfers_from_office_id_idx" ON "transfers" ("from_office_id");
CREATE INDEX IF NOT EXISTS "transfers_to_office_id_idx"   ON "transfers" ("to_office_id");

ALTER TABLE "warehouse_creations" ADD COLUMN IF NOT EXISTS "recipient_user_id" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_creations_recipient_user_id_fkey') THEN
    ALTER TABLE "warehouse_creations" ADD CONSTRAINT "warehouse_creations_recipient_user_id_fkey"
      FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "warehouse_creations_recipient_user_id_idx" ON "warehouse_creations" ("recipient_user_id");

ALTER TABLE "warehouse_creations" ADD COLUMN IF NOT EXISTS "recipient_kind"      "WarehouseTargetKind" NOT NULL DEFAULT 'ADMIN_SELF';
ALTER TABLE "warehouse_creations" ADD COLUMN IF NOT EXISTS "recipient_office_id" TEXT;
ALTER TABLE "warehouse_creations" ALTER COLUMN "recipient_user_id" DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_creations_recipient_office_id_fkey') THEN
    ALTER TABLE "warehouse_creations" ADD CONSTRAINT "warehouse_creations_recipient_office_id_fkey"
      FOREIGN KEY ("recipient_office_id") REFERENCES "offices"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "warehouse_creations_recipient_office_id_idx"
  ON "warehouse_creations" ("recipient_office_id");
