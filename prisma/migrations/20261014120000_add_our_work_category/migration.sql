-- Align DB with schema.prisma: OurWork.category (present on local via db push, missing from prior migrations)
ALTER TABLE "our_works" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'App Development';
