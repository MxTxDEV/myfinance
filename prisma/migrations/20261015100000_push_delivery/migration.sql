-- CreateTable
CREATE TABLE "PushDelivery" (
    "day" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("day")
);

