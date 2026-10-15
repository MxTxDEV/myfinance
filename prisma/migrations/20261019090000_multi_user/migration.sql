-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'SUPER_ADMIN');

-- DropIndex
DROP INDEX "Category_type_name_key";

-- DropIndex
DROP INDEX "Notification_dedupeKey_key";

-- DropIndex
DROP INDEX "PushSlot_day_slot_key";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "GoalEntry" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "InstallmentPlan" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "InvestmentEntry" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "PushSlot" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "RecurringCommitment" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "userId" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "Budget_userId_idx" ON "Budget"("userId");

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_type_name_key" ON "Category"("userId", "type", "name");

-- CreateIndex
CREATE INDEX "CreditCard_userId_idx" ON "CreditCard"("userId");

-- CreateIndex
CREATE INDEX "Debt_userId_idx" ON "Debt"("userId");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE INDEX "GoalEntry_userId_idx" ON "GoalEntry"("userId");

-- CreateIndex
CREATE INDEX "InstallmentPlan_userId_idx" ON "InstallmentPlan"("userId");

-- CreateIndex
CREATE INDEX "Investment_userId_idx" ON "Investment"("userId");

-- CreateIndex
CREATE INDEX "InvestmentEntry_userId_idx" ON "InvestmentEntry"("userId");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "PushSlot_userId_idx" ON "PushSlot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSlot_userId_day_slot_key" ON "PushSlot"("userId", "day", "slot");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "RecurringCommitment_userId_idx" ON "RecurringCommitment"("userId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transfer_userId_idx" ON "Transfer"("userId");

-- ───────────── Dados que já existem passam a pertencer ao primeiro usuário ─────────────
-- (o app era de um único dono: tudo que está no banco é dele)
-- Se há dados mas nenhum perfil (instalação antiga), cria um perfil "legado" para ser o dono.
INSERT INTO "Profile" ("id", "email", "name", "passwordHash", "mustChangePassword", "updatedAt")
SELECT 'legacy_owner', 'legado@local', 'Conta principal', 'disabled', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Profile")
  AND (EXISTS (SELECT 1 FROM "Account") OR EXISTS (SELECT 1 FROM "Category") OR EXISTS (SELECT 1 FROM "Transaction"));

UPDATE "Account" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Category" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Transfer" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "CreditCard" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Invoice" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "InstallmentPlan" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "RecurringCommitment" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Transaction" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Budget" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Goal" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "GoalEntry" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Debt" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Asset" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Notification" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "Investment" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "InvestmentEntry" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "PushSubscription" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';
UPDATE "PushSlot" SET "userId" = (SELECT "id" FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" = '';

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCommitment" ADD CONSTRAINT "RecurringCommitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalEntry" ADD CONSTRAINT "GoalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentEntry" ADD CONSTRAINT "InvestmentEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSlot" ADD CONSTRAINT "PushSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

