-- Phase 5: Track which user consumed bracelets in an expense
-- Add nullable user_id to expenses; backfill from created_by when role is CITY/COUNTRY.

ALTER TABLE "expenses"
  ADD COLUMN "user_id" TEXT;

-- Backfill: existing expenses get userId = created_by when that user has personal balance role
UPDATE "expenses" e
SET "user_id" = e."created_by"
FROM "users" u
WHERE u."id" = e."created_by"
  AND u."role" IN ('CITY', 'COUNTRY');

CREATE INDEX "expenses_user_id_idx" ON "expenses"("user_id");
