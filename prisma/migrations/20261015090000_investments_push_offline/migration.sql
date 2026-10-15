-- CreateEnum
CREATE TYPE "InvestmentType" AS ENUM ('FIXED_INCOME', 'TREASURY', 'STOCKS', 'REAL_ESTATE_FUND', 'FUNDS', 'CRYPTO', 'PENSION', 'OTHER');

-- CreateEnum
CREATE TYPE "InvestmentEntryKind" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL', 'VALUE_UPDATE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DAILY_MESSAGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'INVESTMENT_OUT';
ALTER TYPE "TransactionType" ADD VALUE 'INVESTMENT_IN';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "investmentId" TEXT;

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InvestmentType" NOT NULL,
    "institution" TEXT,
    "currentValue" DECIMAL(14,2) NOT NULL,
    "valueUpdatedAt" DATE NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentEntry" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "kind" "InvestmentEntryKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentEntry_transactionId_key" ON "InvestmentEntry"("transactionId");

-- CreateIndex
CREATE INDEX "InvestmentEntry_investmentId_date_idx" ON "InvestmentEntry"("investmentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_clientId_key" ON "Transaction"("clientId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentEntry" ADD CONSTRAINT "InvestmentEntry_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "InvestmentEntry" ADD CONSTRAINT "InvestmentEntry_amount_nonneg" CHECK ("amount" >= 0);
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_value_nonneg" CHECK ("currentValue" >= 0);
