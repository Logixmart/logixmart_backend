-- CreateTable (JobPost was missing from earlier migrations)
CREATE TABLE IF NOT EXISTS "JobPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "location" TEXT,
    "employmentType" TEXT,
    "salary" TEXT,
    "experience" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JobPost_isDeleted_idx" ON "JobPost"("isDeleted");
CREATE INDEX IF NOT EXISTS "JobPost_isActive_idx" ON "JobPost"("isActive");
CREATE INDEX IF NOT EXISTS "JobPost_createdAt_idx" ON "JobPost"("createdAt");

-- AlterTable (safe if columns already exist from CREATE above)
ALTER TABLE "JobPost" ADD COLUMN IF NOT EXISTS "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "JobPost" ADD COLUMN IF NOT EXISTS "qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[];
