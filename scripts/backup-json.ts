import { backupAll } from '../src/lib/jsonBackup';
import prisma from '../src/lib/prisma';

async function main() {
  await backupAll();
  console.log(
    'Backup written to src/data/: blogs.json, jobPosts.json, jobApplications.json, contactSubmissions.json'
  );
}

main()
  .catch((error) => {
    console.error('Backup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
