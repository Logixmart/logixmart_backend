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
import {
  backupInBackground,
  backupJobApplications,
} from '../lib/jsonBackup';
import prisma from '../lib/prisma';
import { fileStorage } from './storage';
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
  filePath: string;
  filename: string;
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
  private async cleanupUploadedResume(filename?: string): Promise<void> {
    if (!filename) {
      return;
    }
    await fileStorage.deleteIfExists(
      fileStorage.publicPathForFilename(filename, 'resumes')
    );
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

    if (!applicantName) {
      await this.cleanupUploadedResume(input.uploadedFilename);
      throw new AppError('Applicant name is required', 400);
    }

    if (!email) {
      await this.cleanupUploadedResume(input.uploadedFilename);
      throw new AppError('Email is required', 400);
    }

    if (!isValidEmail(email)) {
      await this.cleanupUploadedResume(input.uploadedFilename);
      throw new AppError('Please provide a valid email address', 400);
    }

    const job = await prisma.jobPost.findFirst({
      where: { id: input.jobId },
    });

    if (!job) {
      await this.cleanupUploadedResume(input.uploadedFilename);
      throw new AppError('Job not found', 404);
    }

    if (job.isDeleted || !job.isActive) {
      await this.cleanupUploadedResume(input.uploadedFilename);
      throw new AppError('This job is not accepting applications', 400);
    }

    const resumeUrl = input.uploadedFilename
      ? fileStorage.publicPathForFilename(input.uploadedFilename, 'resumes')
      : null;

    try {
      const application = await prisma.jobApplication.create({
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

      backupInBackground(backupJobApplications, 'jobApplications');

      return {
        id: application.id,
        jobId: application.jobId,
        applicantName: application.applicantName,
        email: application.email,
        status: application.status as ApplicationStatus,
        createdAt: application.createdAt,
      };
    } catch (error) {
      await this.cleanupUploadedResume(input.uploadedFilename);

      if (isPrismaUniqueError(error)) {
        throw new AppError('You have already applied for this job.', 409);
      }

      throw error;
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

    const existing = await prisma.jobApplication.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Application not found', 404);
    }

    const updated = await prisma.jobApplication.update({
      where: { id },
      data: { status: status as ApplicationStatus },
      include: { job: { select: JOB_SELECT } },
    });

    backupInBackground(backupJobApplications, 'jobApplications');
    return withResumeDownloadUrl(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.jobApplication.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Application not found', 404);
    }

    await prisma.jobApplication.delete({ where: { id } });
    await fileStorage.deleteIfExists(existing.resumeUrl);
    backupInBackground(backupJobApplications, 'jobApplications');
  }

  async getResumeDownloadInfo(id: string): Promise<ResumeDownloadInfo> {
    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: { resumeUrl: true },
    });

    if (!application?.resumeUrl) {
      throw new AppError('Resume not found', 404);
    }

    const filename = path.basename(application.resumeUrl);
    const filePath = path.join(config.resumesUploadDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new AppError('Resume file not found', 404);
    }

    return { filePath, filename };
  }
}

export const jobApplicationService = new JobApplicationService();
