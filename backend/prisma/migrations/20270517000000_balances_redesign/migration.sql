-- Balances redesign migration
-- 1) Office gets its own warehouse balance pool
-- 2) Transfer gains kind + optional Office endpoints (peer / distribution / allocation)
-- 3) WarehouseCreation can target either a USER (admin self) or an OFFICE
-- 4) New NotificationType + AuditAction values

-- ─── ENUMS ─────────────────────────────────────────────────────────────

CREATE TYPE "TransferKind" AS ENUM ('PEER', 'DISTRIBUTION', 'ALLOCATION');
CREATE TYPE "WarehouseTargetKind" AS ENUM ('ADMIN_SELF', 'OFFICE');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'OFFICE_SELF_MINT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISTRIBUTION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ALLOCATION_RECEIVED';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WAREHOUSE_MINT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OFFICE_SELF_MINT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DISTRIBUTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ALLOCATION_CREATED';

-- ─── OFFICE BALANCE POOL ───────────────────────────────────────────────

ALTER TABLE "offices"
  ADD COLUMN "balance_black"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "balance_white"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "balance_red"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "balance_blue"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "balance_version" INTEGER NOT NULL DEFAULT 0;

-- ─── TRANSFER: kind + optional office endpoints ───────────────────────

ALTER TABLE "transfers"
  ADD COLUMN "kind"            "TransferKind" NOT NULL DEFAULT 'PEER',
  ADD COLUMN "from_office_id"  TEXT,
  ADD COLUMN "to_office_id"    TEXT,
  ALTER COLUMN "from_user_id" DROP NOT NULL,
  ALTER COLUMN "to_user_id"   DROP NOT NULL;

ALTER TABLE "transfers"
  ADD CONSTRAINT "transfers_from_office_id_fkey"
    FOREIGN KEY ("from_office_id") REFERENCES "offices"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "transfers_to_office_id_fkey"
    FOREIGN KEY ("to_office_id")   REFERENCES "offices"("id") ON DELETE SET NULL;

CREATE INDEX "transfers_kind_idx"           ON "transfers" ("kind");
CREATE INDEX "transfers_from_office_id_idx" ON "transfers" ("from_office_id");
CREATE INDEX "transfers_to_office_id_idx"   ON "transfers" ("to_office_id");

-- ─── WAREHOUSE CREATION: support office target ────────────────────────

ALTER TABLE "warehouse_creations"
  ADD COLUMN "recipient_kind"      "WarehouseTargetKind" NOT NULL DEFAULT 'ADMIN_SELF',
  ADD COLUMN "recipient_office_id" TEXT,
  ALTER COLUMN "recipient_user_id" DROP NOT NULL;

ALTER TABLE "warehouse_creations"
  ADD CONSTRAINT "warehouse_creations_recipient_office_id_fkey"
    FOREIGN KEY ("recipient_office_id") REFERENCES "offices"("id") ON DELETE SET NULL;

CREATE INDEX "warehouse_creations_recipient_office_id_idx"
  ON "warehouse_creations" ("recipient_office_id");
