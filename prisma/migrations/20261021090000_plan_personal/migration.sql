-- AlterEnum
ALTER TYPE "PushKind" ADD VALUE 'PERSONAL';

-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'OUTRO';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "planPrefs" JSONB NOT NULL DEFAULT '{}';

