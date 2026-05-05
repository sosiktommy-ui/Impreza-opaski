-- Add office support to inventory, transfers, and adjustments

-- Inventory: add officeId column
ALTER TABLE "inventory" ADD COLUMN "office_id" TEXT;
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "inventory_entity_type_office_id_idx" ON "inventory"("entity_type", "office_id");

-- Drop old unique constraint and create new one with officeId
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "unique_inventory_entry";
ALTER TABLE "inventory" ADD CONSTRAINT "unique_inventory_entry" UNIQUE ("entity_type", "office_id", "country_id", "city_id", "item_type");

-- Transfers: add office sender/receiver columns
ALTER TABLE "transfers" ADD COLUMN "sender_office_id" TEXT;
ALTER TABLE "transfers" ADD COLUMN "receiver_office_id" TEXT;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sender_office_id_fkey" FOREIGN KEY ("sender_office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_receiver_office_id_fkey" FOREIGN KEY ("receiver_office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "transfers_sender_type_sender_office_id_idx" ON "transfers"("sender_type", "sender_office_id");
CREATE INDEX "transfers_receiver_type_receiver_office_id_idx" ON "transfers"("receiver_type", "receiver_office_id");

-- Adjustments: add officeId column
ALTER TABLE "adjustments" ADD COLUMN "office_id" TEXT;
CREATE INDEX "adjustments_entity_type_office_id_idx" ON "adjustments"("entity_type", "office_id");
