-- Add OFFICE role and related schema changes

-- 1. Add OFFICE to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OFFICE';

-- 2. Add OFFICE to EntityType enum
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'OFFICE';

-- 3. Update TransferStatus enum: add new values
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'DISCREPANCY_FOUND';

-- 4. Update NotificationType enum: add new values
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCEPTANCE_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRANSFER_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISCREPANCY_ALERT';

-- 5. Update AuditAction enum: add new values
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCEPTANCE_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DISCREPANCY_DETECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TRANSFER_ACCEPTED';

-- 6. Create offices table
CREATE TABLE IF NOT EXISTS "offices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "offices_name_key" ON "offices"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "offices_code_key" ON "offices"("code");

-- 7. Add office_id column to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "office_id" TEXT;

-- 8. Add foreign key
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 9. Create acceptance_records table
CREATE TABLE IF NOT EXISTS "acceptance_records" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "accepted_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "acceptance_records_transfer_id_idx" ON "acceptance_records"("transfer_id");

ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 10. Create acceptance_items table
CREATE TABLE IF NOT EXISTS "acceptance_items" (
    "id" TEXT NOT NULL,
    "acceptance_record_id" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "sent_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL,
    "discrepancy" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "acceptance_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "acceptance_items" ADD CONSTRAINT "acceptance_items_acceptance_record_id_fkey" FOREIGN KEY ("acceptance_record_id") REFERENCES "acceptance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 11. Add notes and accepted_at columns to transfers
ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP(3);

-- 12. Add sender/receiver office columns to transfers
ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "sender_office_id" TEXT;
ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "receiver_office_id" TEXT;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sender_office_id_fkey" FOREIGN KEY ("sender_office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_receiver_office_id_fkey" FOREIGN KEY ("receiver_office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 13. Add office_id to inventory
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "office_id" TEXT;

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 14. Add office_id to adjustments
ALTER TABLE "adjustments" ADD COLUMN IF NOT EXISTS "office_id" TEXT;
