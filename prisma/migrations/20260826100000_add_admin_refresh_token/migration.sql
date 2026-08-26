-- AlterTable
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "refreshTokenHash" TEXT;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);
