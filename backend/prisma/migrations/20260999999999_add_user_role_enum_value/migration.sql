-- Add USER value to Role enum so subsequent migration can use it.
-- Postgres requires new enum values to be committed in a separate transaction.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'USER';
