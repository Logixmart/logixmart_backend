import { Prisma } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import {
  ALLOWED_STATUSES,
  ApplicationStatus,
  JOB_SELECT,
  APPLICATION_STATUS_MESSAGE,
} from '../constants/jobApplication';
import prisma from '../lib/prisma';
import { fileStorage, SupabaseResumeStorage } from './storage';
import { AppError } from '../utils/AppError';
import {
  buildPaginationMeta,
  PaginationMeta,
} from '../utils/pagination';
import {
  isPrismaUniqueError,
  isValidEmail,
  optionalTrim,
  parseSearchTerm,
} from '../utils/validation';
import { isValidResumeObjectPath, extensionOf, isAllowedResumeMimeForExtension, isAllowedResumeMimeType, isResumeSizeWithinLimit } from '../utils/resumePaths';
import { verifyResumeObject, deleteResumeObject } from './storage/supabaseResumeObjects';
import { emailService } from './mail';

type JobApplicationWithJob = Prisma.JobApplicationGetPayload<{
  include: { job: { select: typeof JOB_SELECT } };
}>;

export interface CreateJobApplicationInput {
  jobId: string;
  applicantName?: string;
  email?: string;
  phone?: unknown;
  coverLetter?: unknown;
  portfolioUrl?: unknown;
  linkedinUrl?: unknown;
  uploadedFilename?: string;
  resumePath?: unknown;
}

export interface CreateJobApplicationResult {
  id: string;
  jobId: string;
  applicantName: string;
  email: string;
  status: ApplicationStatus;
  createdAt: Date;
}

export interface ListJobApplicationsQuery {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  status?: unknown;
  jobId?: unknown;
}

export interface PaginatedJobApplications {
  data: JobApplicationWithJob[];
  pagination: PaginationMeta;
}

export interface ResumeDownloadInfo {
  filename: string;
  /** Local disk path (legacy). */
  filePath?: string;
  /** Private Storage bytes (preferred when on Supabase). */
  buffer?: Buffer;
  contentType?: string;
}

function withResumeDownloadUrl<T extends { id: string; resumeUrl: string | null }>(
  application: T
): T {
  if (!application.resumeUrl) {
    return application;
  }
  const base = config.apiBaseUrl.replace(/\/$/, '');
  return {
    ...application,
    resumeUrl: `${base}/api/job-applications/${application.id}/resume`,
  };
}

export class JobApplicationService {
  private async cleanupUploadedResume(
    filename?: string,
    resumePath?: string | null
  ): Promise<void> {
    if (filename) {
      const localPath = path.join(config.resumesUploadDir, filename);
      try {
        if (fs.existsSync(localPath)) {
          await fs.promises.unlink(localPath);
        }
      } catch {
        // ignore
      }
      await fileStorage.deleteIfExists(
        fileStorage.publicPathForFilename(filename, 'resumes')
      );
    }

    await this.deleteOrphanedResumeObject(resumePath);
  }

  /**
   * Remove a directly-uploaded resume object after a failed application.
   * Skips deletion when the path is invalid or still referenced by another
   * application, and never throws on cleanup failure.
   */
  private async deleteOrphanedResumeObject(
    resumePath: string | null | undefined
  ): Promise<void> {
    if (!resumePath || !isValidResumeObjectPath(resumePath)) {
      return;
    }
    try {
      const referenced = await prisma.jobApplication.count({
        where: { resumeUrl: resumePath },
      });
      if (referenced > 0) {
        return;
      }
    } catch {
      // If reference check fails, be conservative and keep the object.
      return;
    }
    await deleteResumeObject(resumePath);
  }

  async create(
    input: CreateJobApplicationInput
  ): Promise<CreateJobApplicationResult> {
    const applicantName = String(input.applicantName ?? '').trim();
    const email = String(input.email ?? '').trim().toLowerCase();
    const phone = optionalTrim(input.phone);
    const coverLetter = optionalTrim(input.coverLetter);
    const portfolioUrl = optionalTrim(input.portfolioUrl);
    const linkedinUrl = optionalTrim(input.linkedinUrl);

    const resumePathCandidate =
      typeof input.resumePath === 'string' && input.resumePath.trim()
        ? input.resumePath.trim()
        : null;

    if (!applicantName) {
      await this.cleanupUploadedResume(
        input.uploadedFilename,
        resumePathCandidate
      );
      throw new AppError('Applicant name is required', 400);
    }

    if (!email) {
      await this.cleanupUploadedResume(
        input.uploadedFilename,
        resumePathCandidate
      );
      throw new AppError('Email is required', 400);
    }

    if (!isValidEmail(email)) {
      await this.cleanupUploadedResume(
        input.uploadedFilename,
        resumePathCandidate
      );
      throw new AppError('Please provide a valid email address', 400);
    }

    const job = await prisma.jobPost.findFirst({
      where: { id: input.jobId },
      select: { title: true, isDeleted: true, isActive: true },
    });

    if (!job) {
      await this.cleanupUploadedResume(
        input.uploadedFilename,
        resumePathCandidate
      );
      throw new AppError('Job not found', 404);
    }

    if (job.isDeleted || !job.isActive) {
      await this.cleanupUploadedResume(
        input.uploadedFilename,
        resumePathCandidate
      );
      throw new AppError('This job is not accepting applications', 400);
    }

    let resumeUrl: string | null = null;
    const hasMultipart = Boolean(input.uploadedFilename);
    const hasResumePath = Boolean(resumePathCandidate);

    if (hasMultipart && hasResumePath) {
      await this.cleanupUploadedResume(
        input.uploadedFilename,
        resumePathCandidate
      );
      throw new AppError(
        'Provide either a resume file or a resumePath, not both',
        400
      );
    }

    if (hasResumePath && resumePathCandidate) {
      const trimmedPath = resumePathCandidate;
      if (!isValidResumeObjectPath(trimmedPath)) {
        await this.cleanupUploadedResume(undefined, trimmedPath);
        throw new AppError('Invalid resumePath format', 400);
      }

      const verification = await verifyResumeObject(trimmedPath);
      if (!verification.exists) {
        await this.cleanupUploadedResume(undefined, trimmedPath);
        throw new AppError('Resume file not found in storage', 404);
      }

      const size = verification.size;
      const contentType = verification.contentType;
      if (size !== undefined && !isResumeSizeWithinLimit(size)) {
        await this.cleanupUploadedResume(undefined, trimmedPath);
        throw new AppError('Resume must be 5MB or smaller', 413);
      }
      if (contentType) {
        const storedMime = contentType.toLowerCase();
        if (
          !isAllowedResumeMimeType(storedMime) ||
          !isAllowedResumeMimeForExtension(extensionOf(trimmedPath), storedMime)
        ) {
          await this.cleanupUploadedResume(undefined, trimmedPath);
          throw new AppError(
            'Only resume files (pdf, doc, docx) are allowed',
            400
          );
        }
      }

      resumeUrl = trimmedPath;
    } else if (hasMultipart) {
      const localPath = path.join(
        config.resumesUploadDir,
        input.uploadedFilename as string
      );
      resumeUrl = await fileStorage.persistLocalUpload(
        localPath,
        input.uploadedFilename as string,
        'resumes'
      );
    }

    let application;
    try {
      application = await prisma.jobApplication.create({
        data: {
          jobId: input.jobId,
          applicantName,
          email,
          phone,
          coverLetter,
          portfolioUrl,
          linkedinUrl,
          resumeUrl,
        },
      });
    } catch (error) {
      await this.cleanupUploadedResume(input.uploadedFilename, resumeUrl);

      if (isPrismaUniqueError(error)) {
        throw new AppError('You have already applied for this job.', 409);
      }

      throw error;
    }

    // Notify HR only after the application is durably saved, and outside the
    // persistence error path so a notification failure can never delete the
    // saved application or its resume.
    await this.notifyHrOfApplication(application, job.title, Boolean(resumeUrl));

    return {
      id: application.id,
      jobId: application.jobId,
      applicantName: application.applicantName,
      email: application.email,
      status: application.status as ApplicationStatus,
      createdAt: application.createdAt,
    };
  }

  /** Admin application URL when ADMIN_APP_URL is configured; otherwise null. */
  private buildAdminApplicationUrl(id: string): string | null {
    const base = config.mail.adminAppUrl.replace(/\/$/, '');
    if (!base) {
      return null;
    }
    return `${base}/job-applications/${id}`;
  }

  private async notifyHrOfApplication(
    application: {
      id: string;
      applicantName: string;
      email: string;
      phone: string | null;
      portfolioUrl: string | null;
      linkedinUrl: string | null;
      coverLetter: string | null;
      createdAt: Date;
    },
    jobTitle: string,
    resumeProvided: boolean
  ): Promise<void> {
    try {
      await emailService.sendJobApplicationNotification({
        id: application.id,
        jobTitle,
        applicantName: application.applicantName,
        email: application.email,
        phone: application.phone,
        portfolioUrl: application.portfolioUrl,
        linkedinUrl: application.linkedinUrl,
        coverLetter: application.coverLetter,
        resumeProvided,
        createdAt: application.createdAt,
        adminUrl: this.buildAdminApplicationUrl(application.id),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      console.error('[mail] HR notification error:', reason);
    }
  }

  buildListWhere(query: ListJobApplicationsQuery): Prisma.JobApplicationWhereInput {
    const where: Prisma.JobApplicationWhereInput = {};
    const search = parseSearchTerm(query.search);

    if (search) {
      where.OR = [
        { applicantName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (typeof query.status === 'string' && query.status.trim()) {
      const status = query.status.trim().toUpperCase();
      if (!ALLOWED_STATUSES.includes(status as ApplicationStatus)) {
        throw new AppError('Invalid status filter', 400);
      }
      where.status = status as ApplicationStatus;
    }

    if (typeof query.jobId === 'string' && query.jobId.trim()) {
      where.jobId = query.jobId.trim();
    }

    return where;
  }

  async list(query: ListJobApplicationsQuery): Promise<PaginatedJobApplications> {
    const pageNumber = Math.max(Number(query.page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;
    const where = this.buildListWhere(query);

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        include: { job: { select: JOB_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber,
      }),
      prisma.jobApplication.count({ where }),
    ]);

    return {
      data: applications.map(withResumeDownloadUrl),
      pagination: buildPaginationMeta(pageNumber, limitNumber, total),
    };
  }

  async getById(id: string): Promise<JobApplicationWithJob> {
    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: { job: { select: JOB_SELECT } },
    });

    if (!application) {
      throw new AppError('Application not found', 404);
    }

    return withResumeDownloadUrl(application);
  }

  async updateStatus(
    id: string,
    statusInput: unknown
  ): Promise<JobApplicationWithJob> {
    const status = String(statusInput ?? '').trim().toUpperCase();

    if (!ALLOWED_STATUSES.includes(status as ApplicationStatus)) {
      throw new AppError(APPLICATION_STATUS_MESSAGE, 400);
    }

    const existing = await prisma.jobApplication.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError('Application not found', 404);
    }

    const updated = await prisma.jobApplication.update({
      where: { id },
      data: { status: status as ApplicationStatus },
      include: { job: { select: JOB_SELECT } },
    });

    return withResumeDownloadUrl(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.jobApplication.findUnique({
      where: { id },
      select: { resumeUrl: true },
    });
    if (!existing) {
      throw new AppError('Application not found', 404);
    }

    await prisma.jobApplication.delete({ where: { id } });
    await fileStorage.deleteIfExists(existing.resumeUrl);
  }

  async getResumeDownloadInfo(id: string): Promise<ResumeDownloadInfo> {
    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: { resumeUrl: true },
    });

    if (!application?.resumeUrl) {
      throw new AppError('Resume not found', 404);
    }

    const stored = application.resumeUrl;
    const filename = path.basename(stored);

    // Private Supabase object path (resumes/...)
    if (
      fileStorage instanceof SupabaseResumeStorage &&
      stored.startsWith('resumes/')
    ) {
      const downloaded = await fileStorage.download(stored);
      return {
        filename: downloaded.filename,
        buffer: downloaded.buffer,
        contentType: downloaded.contentType,
      };
    }

    // Legacy local path (/uploads/resumes/...)
    const filePath = path.join(config.resumesUploadDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new AppError('Resume file not found', 404);
    }

    return { filePath, filename };
  }
}

export const jobApplicationService = new JobApplicationService();
