import bcrypt from 'bcryptjs';
import { PrismaClient, AdminRole } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const BOOTSTRAP_ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || 'admin@logixmart.com';
const BOOTSTRAP_ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'Password@123';
const BOOTSTRAP_ADMIN_NAME = process.env.ADMIN_NAME || 'Super Admin';

async function seedSuperAdmin(): Promise<{
  created: boolean;
  updated: boolean;
  skipped: boolean;
}> {
  const email = BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  const existing = await prisma.admin.findUnique({ where: { email } });

  if (existing) {
    // Keep local login in sync with .env ADMIN_PASSWORD
    await prisma.admin.update({
      where: { email },
      data: {
        passwordHash,
        name: BOOTSTRAP_ADMIN_NAME,
        role: AdminRole.SUPER_ADMIN,
      },
    });
    return { created: false, updated: true, skipped: false };
  }

  await prisma.admin.create({
    data: {
      name: BOOTSTRAP_ADMIN_NAME,
      email,
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
    },
  });

  return { created: true, updated: false, skipped: false };
}

async function main() {
  const superAdmin = await seedSuperAdmin();

  console.log(
    `Seed complete. superAdmin created=${superAdmin.created} updated=${superAdmin.updated} skipped=${superAdmin.skipped}`
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
