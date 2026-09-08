import { Prisma } from '@prisma/client';
import {
  backupInBackground,
  backupJobPosts,
} from '../lib/jsonBackup';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import {
  buildPaginationMeta,
  PaginationMeta,
} from '../utils/pagination';
import {
  normalizeStringList,
  parseSearchTerm,
} from '../utils/validation';

type JobPost = NonNullable<Awaited<ReturnType<typeof prisma.jobPost.findFirst>>>;

export interface CreateJobPostInput {
  title?: string;
  description?: string;
  location?: string;
  employmentType?: string;
  experience?: string;
  skills?: unknown;
  responsibilities?: unknown;
  qualifications?: unknown;
  isActive?: boolean;
}

export interface UpdateJobPostInput {
  id: string;
  title?: string;
  description?: string;
  location?: string;
  employmentType?: string;
  experience?: string;
  skills?: unknown;
  responsibilities?: unknown;
  qualifications?: unknown;
  isActive?: boolean;
}

export interface ListJobPostsQuery {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  active?: unknown;
}

export interface PaginatedJobPosts {
  data: JobPost[];
  pagination: PaginationMeta;
}

export class JobPostService {
  async create(input: CreateJobPostInput): Promise<JobPost> {
    if (!input.title?.trim()) {
      throw new AppError('Job title is required', 400);
    }

    if (!input.description?.trim()) {
      throw new AppError('Job description is required', 400);
    }

    const job = await prisma.jobPost.create({
      data: {
        title: input.title.trim(),
        description: input.description.trim(),
        location: input.location?.trim() || null,
        employmentType: input.employmentType?.trim() || null,
        experience: input.experience?.trim() || null,
        skills: normalizeStringList(input.skills),
        responsibilities: normalizeStringList(input.responsibilities),
        qualifications: normalizeStringList(input.qualifications),
        isActive: Boolean(input.isActive ?? true),
      },
    });

    backupInBackground(backupJobPosts, 'jobPosts');
    return job;
  }

  async list(query: ListJobPostsQuery): Promise<PaginatedJobPosts> {
    const pageNumber = Math.max(Number(query.page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.JobPostWhereInput = {
      isDeleted: false,
    };

    const search = parseSearchTerm(query.search);
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.active !== undefined) {
      where.isActive = query.active === 'true';
    }

    const [jobs, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber,
      }),
      prisma.jobPost.count({ where }),
    ]);

    return {
      data: jobs,
      pagination: buildPaginationMeta(pageNumber, limitNumber, total),
    };
  }

  async getById(id: string): Promise<JobPost> {
    const job = await prisma.jobPost.findFirst({
      where: { id, isDeleted: false },
    });

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    return job;
  }

  async update(input: UpdateJobPostInput): Promise<JobPost> {
    const existingJob = await prisma.jobPost.findFirst({
      where: { id: input.id, isDeleted: false },
    });

    if (!existingJob) {
      throw new AppError('Job not found', 404);
    }

    const updateData: Prisma.JobPostUpdateInput = {};

    if (input.title !== undefined) {
      updateData.title = input.title.trim();
    }

    if (input.description !== undefined) {
      updateData.description = input.description.trim();
    }

    if (input.location !== undefined) {
      updateData.location = input.location?.trim() || null;
    }

    if (input.employmentType !== undefined) {
      updateData.employmentType = input.employmentType?.trim() || null;
    }

    if (input.experience !== undefined) {
      updateData.experience = input.experience?.trim() || null;
    }

    if (input.skills !== undefined) {
      updateData.skills = normalizeStringList(input.skills);
    }

    if (input.responsibilities !== undefined) {
      updateData.responsibilities = normalizeStringList(input.responsibilities);
    }

    if (input.qualifications !== undefined) {
      updateData.qualifications = normalizeStringList(input.qualifications);
    }

    if (input.isActive !== undefined) {
      updateData.isActive = Boolean(input.isActive);
    }

    const updatedJob = await prisma.jobPost.update({
      where: { id: input.id },
      data: updateData,
    });

    backupInBackground(backupJobPosts, 'jobPosts');
    return updatedJob;
  }

  async delete(id: string): Promise<void> {
    const existingJob = await prisma.jobPost.findFirst({
      where: { id, isDeleted: false },
    });

    if (!existingJob) {
      throw new AppError('Job not found', 404);
    }

    await prisma.jobPost.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
      },
    });

    backupInBackground(backupJobPosts, 'jobPosts');
  }
}

export const jobPostService = new JobPostService();
