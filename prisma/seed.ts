import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { PrismaClient, JobApplicationStatus, AdminRole } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();
const DATA_DIR = path.join(process.cwd(), 'src/data');

const BOOTSTRAP_ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || 'admin@logixmart.com';
const BOOTSTRAP_ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'LogixmartAdmin2026!';
const BOOTSTRAP_ADMIN_NAME = process.env.ADMIN_NAME || 'Super Admin';

interface BackupBlog {
  id: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackupJobPost {
  id: string;
  title: string;
  description: string;
  location?: string | null;
  employmentType?: string | null;
  experience?: string | null;
  skills?: string[];
  responsibilities?: string[];
  qualifications?: string[];
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BackupJobApplication {
  id: string;
  jobId: string;
  applicantName: string;
  email: string;
  phone?: string | null;
  resumeUrl?: string | null;
  coverLetter?: string | null;
  portfolioUrl?: string | null;
  linkedinUrl?: string | null;
  status?: JobApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

interface BackupContactSubmission {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  createdAt: string;
  updatedAt: string;
}

function readJsonArray<T>(fileName: string): T[] {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`No ${fileName} found — skipping.`);
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw || '[]');
  if (!Array.isArray(parsed)) {
    console.log(`${fileName} is not an array — skipping.`);
    return [];
  }
  return parsed as T[];
}

async function seedBlogs(): Promise<{ created: number; skipped: number }> {
  const blogs = readJsonArray<BackupBlog>('blogs.json');
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

  return { created, skipped };
}

async function seedJobPosts(): Promise<{ created: number; skipped: number }> {
  const jobs = readJsonArray<BackupJobPost>('jobPosts.json');
  let created = 0;
  let skipped = 0;

  for (const job of jobs) {
    const existing = await prisma.jobPost.findUnique({ where: { id: job.id } });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.jobPost.create({
      data: {
        id: job.id,
        title: job.title,
        description: job.description,
        location: job.location ?? null,
        employmentType: job.employmentType ?? null,
        experience: job.experience ?? null,
        skills: job.skills ?? [],
        responsibilities: job.responsibilities ?? [],
        qualifications: job.qualifications ?? [],
        isActive: job.isActive ?? true,
        isDeleted: job.isDeleted ?? false,
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.updatedAt),
      },
    });
    created += 1;
  }

  return { created, skipped };
}

async function seedJobApplications(): Promise<{
  created: number;
  skipped: number;
}> {
  const applications = readJsonArray<BackupJobApplication>('jobApplications.json');
  let created = 0;
  let skipped = 0;

  for (const app of applications) {
    const existing = await prisma.jobApplication.findUnique({
      where: { id: app.id },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const job = await prisma.jobPost.findUnique({ where: { id: app.jobId } });
    if (!job) {
      console.log(
        `Skipping application ${app.id}: job ${app.jobId} not found`
      );
      skipped += 1;
      continue;
    }

    await prisma.jobApplication.create({
      data: {
        id: app.id,
        jobId: app.jobId,
        applicantName: app.applicantName,
        email: app.email,
        phone: app.phone ?? null,
        resumeUrl: app.resumeUrl ?? null,
        coverLetter: app.coverLetter ?? null,
        portfolioUrl: app.portfolioUrl ?? null,
        linkedinUrl: app.linkedinUrl ?? null,
        status: app.status ?? 'PENDING',
        createdAt: new Date(app.createdAt),
        updatedAt: new Date(app.updatedAt),
      },
    });
    created += 1;
  }

  return { created, skipped };
}

async function seedContactSubmissions(): Promise<{
  created: number;
  skipped: number;
}> {
  const contacts = readJsonArray<BackupContactSubmission>(
    'contactSubmissions.json'
  );
  let created = 0;
  let skipped = 0;

  for (const contact of contacts) {
    const existing = await prisma.contactSubmission.findUnique({
      where: { id: contact.id },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.contactSubmission.create({
      data: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone ?? null,
        subject: contact.subject ?? null,
        message: contact.message,
        createdAt: new Date(contact.createdAt),
        updatedAt: new Date(contact.updatedAt),
      },
    });
    created += 1;
  }

  return { created, skipped };
}

async function seedSuperAdmin(): Promise<{ created: boolean; skipped: boolean }> {
  const email = BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  const existing = await prisma.admin.findUnique({ where: { email } });

  if (existing) {
    return { created: false, skipped: true };
  }

  const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  await prisma.admin.create({
    data: {
      name: BOOTSTRAP_ADMIN_NAME,
      email,
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
    },
  });

  return { created: true, skipped: false };
}

async function main() {
  const superAdmin = await seedSuperAdmin();
  const blogs = await seedBlogs();
  const jobs = await seedJobPosts();
  const applications = await seedJobApplications();
  const contacts = await seedContactSubmissions();

  console.log(
    `Seed complete. superAdmin created=${superAdmin.created} skipped=${superAdmin.skipped}; ` +
      `blogs created=${blogs.created} skipped=${blogs.skipped}; ` +
      `jobPosts created=${jobs.created} skipped=${jobs.skipped}; ` +
      `jobApplications created=${applications.created} skipped=${applications.skipped}; ` +
      `contactSubmissions created=${contacts.created} skipped=${contacts.skipped}`
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
