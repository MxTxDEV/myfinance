-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'CARD_BALANCE';

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN     "monthlyRate" DECIMAL(8,4);

