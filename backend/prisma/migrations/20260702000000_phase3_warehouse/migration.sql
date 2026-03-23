-- Phase 3: Warehouse Management and CANCEL_TRANSFER resolution

-- Add CANCEL_TRANSFER to ResolutionType enum
ALTER TYPE "ResolutionType" ADD VALUE IF NOT EXISTS 'CANCEL_TRANSFER';

-- Create WarehouseCreation table for tracking bracelet creation by ADMIN/OFFICE
CREATE TABLE IF NOT EXISTS "warehouse_creations" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "office_id" TEXT,
    "black" INTEGER NOT NULL DEFAULT 0,
    "white" INTEGER NOT NULL DEFAULT 0,
    "red" INTEGER NOT NULL DEFAULT 0,
    "blue" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "warehouse_creations_pkey" PRIMARY KEY ("id")
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "warehouse_creations_entity_type_office_id_idx" ON "warehouse_creations"("entity_type", "office_id");
CREATE INDEX IF NOT EXISTS "warehouse_creations_created_by_idx" ON "warehouse_creations"("created_by");
CREATE INDEX IF NOT EXISTS "warehouse_creations_created_at_idx" ON "warehouse_creations"("created_at");

-- Add foreign key constraint for office relation
ALTER TABLE "warehouse_creations" ADD CONSTRAINT "warehouse_creations_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
