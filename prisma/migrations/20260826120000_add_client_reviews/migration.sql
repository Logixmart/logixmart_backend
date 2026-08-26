-- CreateTable
CREATE TABLE "ClientReview" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientReview_createdAt_idx" ON "ClientReview"("createdAt");

-- CreateIndex
CREATE INDEX "ClientReview_email_idx" ON "ClientReview"("email");
