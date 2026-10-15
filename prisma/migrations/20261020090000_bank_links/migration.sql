-- CreateTable
CREATE TABLE "BankLink" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPDATED',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "BankLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankLinkAccount" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "pluggyAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subtype" TEXT,
    "balance" DECIMAL(14,2),
    "creditLimit" DECIMAL(14,2),
    "closingDay" INTEGER,
    "dueDay" INTEGER,
    "accountId" TEXT,
    "cardId" TEXT,
    "createdByLink" BOOLEAN NOT NULL DEFAULT false,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "BankLinkAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankLink_userId_idx" ON "BankLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankLink_userId_itemId_key" ON "BankLink"("userId", "itemId");

-- CreateIndex
CREATE INDEX "BankLinkAccount_userId_idx" ON "BankLinkAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankLinkAccount_userId_pluggyAccountId_key" ON "BankLinkAccount"("userId", "pluggyAccountId");

-- AddForeignKey
ALTER TABLE "BankLink" ADD CONSTRAINT "BankLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankLinkAccount" ADD CONSTRAINT "BankLinkAccount_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "BankLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankLinkAccount" ADD CONSTRAINT "BankLinkAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

