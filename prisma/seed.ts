import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JSON_PATH = path.join(process.cwd(), 'src/data/blogs.json');

interface LegacyBlog {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.log('No blogs.json found — nothing to seed.');
    return;
  }

  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const blogs: LegacyBlog[] = JSON.parse(raw || '[]');

  if (!blogs.length) {
    console.log('blogs.json is empty — nothing to seed.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const blog of blogs) {
    const existing = await prisma.blog.findUnique({ where: { id: blog.id } });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.blog.create({
      data: {
        id: blog.id,
        title: blog.title,
        description: blog.description,
        imageUrl: blog.imageUrl ?? null,
        createdAt: new Date(blog.createdAt),
        updatedAt: new Date(blog.updatedAt),
      },
    });
    created += 1;
  }

  console.log(`Seed complete. Created: ${created}, skipped (already exist): ${skipped}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
