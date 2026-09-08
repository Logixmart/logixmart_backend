import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import prisma from './prisma';

const DATA_DIR = path.join(process.cwd(), 'src/data');

export const BLOGS_BACKUP_PATH = path.join(DATA_DIR, 'blogs.json');
export const JOB_POSTS_BACKUP_PATH = path.join(DATA_DIR, 'jobPosts.json');
export const JOB_APPLICATIONS_BACKUP_PATH = path.join(
  DATA_DIR,
  'jobApplications.json'
);
export const CONTACT_SUBMISSIONS_BACKUP_PATH = path.join(
  DATA_DIR,
  'contactSubmissions.json'
);

const pendingBackups = new Map<string, NodeJS.Timeout>();

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

/** Snapshot all blogs → src/data/blogs.json */
export async function backupBlogs(): Promise<void> {
  const blogs = await prisma.blog.findMany({
    orderBy: { createdAt: 'asc' },
  });
  await writeJson(
    BLOGS_BACKUP_PATH,
    blogs.map((blog) => ({
      id: blog.id,
      title: blog.title,
      description: blog.description,
      ...(blog.imageUrl ? { imageUrl: blog.imageUrl } : {}),
      createdAt: blog.createdAt.toISOString(),
      updatedAt: blog.updatedAt.toISOString(),
    }))
  );
}

/** Snapshot all job posts (including soft-deleted) → src/data/jobPosts.json */
export async function backupJobPosts(): Promise<void> {
  const jobs = await prisma.jobPost.findMany({
    orderBy: { createdAt: 'asc' },
  });
  await writeJson(
    JOB_POSTS_BACKUP_PATH,
    jobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      location: job.location,
      employmentType: job.employmentType,
      experience: job.experience,
      skills: job.skills,
      responsibilities: job.responsibilities,
      qualifications: job.qualifications,
      isActive: job.isActive,
      isDeleted: job.isDeleted,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }))
  );
}

/** Snapshot all job applications → src/data/jobApplications.json */
export async function backupJobApplications(): Promise<void> {
  const applications = await prisma.jobApplication.findMany({
    orderBy: { createdAt: 'asc' },
  });
  await writeJson(
    JOB_APPLICATIONS_BACKUP_PATH,
    applications.map((app) => ({
      id: app.id,
      jobId: app.jobId,
      applicantName: app.applicantName,
      email: app.email,
      phone: app.phone,
      resumeUrl: app.resumeUrl,
      coverLetter: app.coverLetter,
      portfolioUrl: app.portfolioUrl,
      linkedinUrl: app.linkedinUrl,
      status: app.status,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    }))
  );
}

/** Snapshot all contact submissions → src/data/contactSubmissions.json */
export async function backupContactSubmissions(): Promise<void> {
  const contacts = await prisma.contactSubmission.findMany({
    orderBy: { createdAt: 'asc' },
  });
  await writeJson(
    CONTACT_SUBMISSIONS_BACKUP_PATH,
    contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      subject: contact.subject,
      message: contact.message,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    }))
  );
}

/** Write all JSON backups (blogs, jobs, applications, contacts). */
export async function backupAll(): Promise<void> {
  await Promise.all([
    backupBlogs(),
    backupJobPosts(),
    backupJobApplications(),
    backupContactSubmissions(),
  ]);
}

/**
 * Debounced fire-and-forget backup.
 * Coalesces rapid writes so one table scan runs after a quiet period.
 */
export function backupInBackground(
  task: () => Promise<void>,
  label: string
): void {
  if (!config.enableJsonBackup) {
    return;
  }

  const existing = pendingBackups.get(label);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    pendingBackups.delete(label);
    void task().catch((error) => {
      console.error(`JSON backup failed (${label}):`, error);
    });
  }, config.jsonBackupDebounceMs);

  pendingBackups.set(label, timeout);
}
