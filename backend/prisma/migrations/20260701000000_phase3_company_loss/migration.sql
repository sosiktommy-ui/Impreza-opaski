-- Phase 3: CompanyLoss tracking and Resolution types

-- Create ResolutionType enum
CREATE TYPE "ResolutionType" AS ENUM ('ACCEPT_SENDER', 'ACCEPT_RECEIVER', 'ACCEPT_COMPROMISE');

-- Create CompanyLoss table matching Prisma schema
CREATE TABLE "company_losses" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "black" INTEGER NOT NULL DEFAULT 0,
    "white" INTEGER NOT NULL DEFAULT 0,
    "red" INTEGER NOT NULL DEFAULT 0,
    "blue" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "resolution_type" "ResolutionType" NOT NULL,
    "resolved_by" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sender_name" TEXT NOT NULL,
    "sender_city" TEXT,
    "receiver_name" TEXT NOT NULL,
    "receiver_city" TEXT,
    "original_sent" INTEGER NOT NULL,
    "original_received" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "company_losses_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX "company_losses_transfer_id_idx" ON "company_losses"("transfer_id");
CREATE INDEX "company_losses_resolved_by_idx" ON "company_losses"("resolved_by");
CREATE INDEX "company_losses_resolved_at_idx" ON "company_losses"("resolved_at");

-- Add foreign keys
ALTER TABLE "company_losses" ADD CONSTRAINT "company_losses_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_losses" ADD CONSTRAINT "company_losses_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add new audit actions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t 
                   JOIN pg_enum e ON t.oid = e.enumtypid
                   WHERE t.typname = 'AuditAction' 
                   AND e.enumlabel = 'DISCREPANCY_RESOLVED') THEN
        ALTER TYPE "AuditAction" ADD VALUE 'DISCREPANCY_RESOLVED';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type t 
                   JOIN pg_enum e ON t.oid = e.enumtypid
                   WHERE t.typname = 'AuditAction' 
                   AND e.enumlabel = 'BALANCE_TOPUP') THEN
        ALTER TYPE "AuditAction" ADD VALUE 'BALANCE_TOPUP';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type t 
                   JOIN pg_enum e ON t.oid = e.enumtypid
                   WHERE t.typname = 'AuditAction' 
                   AND e.enumlabel = 'BALANCE_EDITED') THEN
        ALTER TYPE "AuditAction" ADD VALUE 'BALANCE_EDITED';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type t 
                   JOIN pg_enum e ON t.oid = e.enumtypid
                   WHERE t.typname = 'AuditAction' 
                   AND e.enumlabel = 'COMPANY_LOSS_RECORDED') THEN
        ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_LOSS_RECORDED';
    END IF;
END
$$;
