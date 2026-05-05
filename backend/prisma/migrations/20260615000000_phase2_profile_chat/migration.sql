-- Phase 2: Profile + Chat + Schema Fixes

-- AlterTable: Make email optional
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable: Add avatar_url to users
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;

-- AlterTable: Make event_date optional in expenses
ALTER TABLE "expenses" ALTER COLUMN "event_date" DROP NOT NULL;

-- CreateTable: chat_messages
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_sender_id_receiver_id_idx" ON "chat_messages"("sender_id", "receiver_id");

-- CreateIndex
CREATE INDEX "chat_messages_receiver_id_read_idx" ON "chat_messages"("receiver_id", "read");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
