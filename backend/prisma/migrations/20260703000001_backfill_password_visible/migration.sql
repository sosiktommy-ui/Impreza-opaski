-- Backfill password_visible for seed users (identified by @impreza.io email)
-- Admin account
UPDATE "users" SET "password_visible" = 'Impreza@Admin2026!' WHERE "username" = 'dmitryganj' AND "password_visible" IS NULL;

-- All other seed accounts follow pattern: username_2025!Imp
UPDATE "users" SET "password_visible" = "username" || '_2025!Imp'
WHERE "username" != 'dmitryganj' AND "email" LIKE '%@impreza.io' AND "password_visible" IS NULL;
