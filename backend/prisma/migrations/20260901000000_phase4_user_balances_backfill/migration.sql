-- Phase 4: Backfill personal balances from Inventory via UserAccess
-- Idempotent. Safe to re-run.

-- 1) For CITY accesses → mirror Inventory(CITY, scope_id) into the user's balance fields
UPDATE "users" u
SET
  "balance_black"   = COALESCE(inv."black", 0),
  "balance_white"   = COALESCE(inv."white", 0),
  "balance_red"     = COALESCE(inv."red", 0),
  "balance_blue"    = COALESCE(inv."blue", 0),
  "balance_version" = u."balance_version" + 1
FROM (
  SELECT
    ua."user_id" AS user_id,
    SUM(CASE WHEN i."item_type" = 'BLACK' THEN i."quantity" ELSE 0 END) AS "black",
    SUM(CASE WHEN i."item_type" = 'WHITE' THEN i."quantity" ELSE 0 END) AS "white",
    SUM(CASE WHEN i."item_type" = 'RED'   THEN i."quantity" ELSE 0 END) AS "red",
    SUM(CASE WHEN i."item_type" = 'BLUE'  THEN i."quantity" ELSE 0 END) AS "blue"
  FROM "user_access" ua
  JOIN "inventory" i
    ON i."entity_type" = 'CITY'
   AND i."city_id"     = ua."scope_id"
  WHERE ua."scope_type" = 'CITY'
    AND ua."revoked_at" IS NULL
    AND (ua."expires_at" IS NULL OR ua."expires_at" > NOW())
  GROUP BY ua."user_id"
) inv
WHERE u."id" = inv.user_id
  AND u."role" IN ('CITY', 'COUNTRY');

-- 2) For COUNTRY accesses → mirror Inventory(COUNTRY, scope_id)
UPDATE "users" u
SET
  "balance_black"   = COALESCE(inv."black", 0),
  "balance_white"   = COALESCE(inv."white", 0),
  "balance_red"     = COALESCE(inv."red", 0),
  "balance_blue"    = COALESCE(inv."blue", 0),
  "balance_version" = u."balance_version" + 1
FROM (
  SELECT
    ua."user_id" AS user_id,
    SUM(CASE WHEN i."item_type" = 'BLACK' THEN i."quantity" ELSE 0 END) AS "black",
    SUM(CASE WHEN i."item_type" = 'WHITE' THEN i."quantity" ELSE 0 END) AS "white",
    SUM(CASE WHEN i."item_type" = 'RED'   THEN i."quantity" ELSE 0 END) AS "red",
    SUM(CASE WHEN i."item_type" = 'BLUE'  THEN i."quantity" ELSE 0 END) AS "blue"
  FROM "user_access" ua
  JOIN "inventory" i
    ON i."entity_type" = 'COUNTRY'
   AND i."country_id"  = ua."scope_id"
  WHERE ua."scope_type" = 'COUNTRY'
    AND ua."revoked_at" IS NULL
    AND (ua."expires_at" IS NULL OR ua."expires_at" > NOW())
  GROUP BY ua."user_id"
) inv
WHERE u."id" = inv.user_id
  AND u."role" IN ('CITY', 'COUNTRY');
