-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "importKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_importKey_key" ON "Transaction"("importKey");

