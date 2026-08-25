import fs from 'fs';
import path from 'path';
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

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDataDir();
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

/** Snapshot all blogs → src/data/blogs.json */
export async function backupBlogs(): Promise<void> {
  const blogs = await prisma.blog.findMany({
    orderBy: { createdAt: 'asc' },
  });
  writeJson(
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
  writeJson(
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
  writeJson(
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
  writeJson(
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
  await backupBlogs();
  await backupJobPosts();
  await backupJobApplications();
  await backupContactSubmissions();
}

/** Fire-and-forget backup; logs errors without failing the request. */
export function backupInBackground(
  task: () => Promise<void>,
  label: string
): void {
  void task().catch((error) => {
    console.error(`JSON backup failed (${label}):`, error);
  });
}
