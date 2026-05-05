-- CreateEnum
CREATE TYPE "ShortageReason" AS ENUM ('SENDER_BLAMED', 'RECEIVER_BLAMED', 'SPLIT_LOSS');

-- CreateTable
CREATE TABLE "shortages" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "office_id" TEXT,
    "country_id" TEXT,
    "city_id" TEXT,
    "transfer_id" TEXT NOT NULL,
    "black" INTEGER NOT NULL DEFAULT 0,
    "white" INTEGER NOT NULL DEFAULT 0,
    "red" INTEGER NOT NULL DEFAULT 0,
    "blue" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL,
    "reason" "ShortageReason" NOT NULL,
    "resolution_type" "ResolutionType" NOT NULL,
    "resolved_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "shortages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shortages_entity_type_office_id_idx" ON "shortages"("entity_type", "office_id");

-- CreateIndex
CREATE INDEX "shortages_entity_type_country_id_idx" ON "shortages"("entity_type", "country_id");

-- CreateIndex
CREATE INDEX "shortages_entity_type_city_id_idx" ON "shortages"("entity_type", "city_id");

-- CreateIndex
CREATE INDEX "shortages_transfer_id_idx" ON "shortages"("transfer_id");

-- CreateIndex
CREATE INDEX "shortages_resolved_by_idx" ON "shortages"("resolved_by");

-- CreateIndex
CREATE INDEX "shortages_created_at_idx" ON "shortages"("created_at");

-- AddForeignKey
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
