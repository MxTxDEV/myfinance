-- CreateEnum
CREATE TYPE "PushKind" AS ENUM ('MORNING', 'SPEND', 'INVEST');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DEBT_DUE';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pushedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "PushDelivery";

-- CreateTable
CREATE TABLE "PushSlot" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "kind" "PushKind" NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "prefsKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Heartbeat" (
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PushSlot_day_sentAt_idx" ON "PushSlot"("day", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSlot_day_slot_key" ON "PushSlot"("day", "slot");

