import crypto from 'crypto';
import { isSupabaseConfigured } from '../config/supabase';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import {
  extensionOf,
  isAllowedResumeExtension,
  isAllowedResumeMimeForExtension,
  isAllowedResumeMimeType,
  isResumeSizeWithinLimit,
  isSafeResumeFilename,
} from '../utils/resumePaths';
import {
  createSignedResumeUploadUrl,
  getResumeBucket,
} from './storage/supabaseResumeObjects';

export interface CreateResumeUploadUrlInput {
  jobId?: unknown;
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
}

export interface ValidatedResumeUploadRequest {
  extension: string;
  contentType: string;
}

export interface CreateResumeUploadUrlResult {
  bucket: string;
  path: string;
  token: string;
}

/**
 * Validate a public applicant's resume upload request, generate the object
 * path on the server (the client never chooses it) and mint a short-lived
 * signed upload URL/token for the private `private-resumes` bucket.
 */
export class ResumeUploadService {
  validate(input: CreateResumeUploadUrlInput): ValidatedResumeUploadRequest {
    const { filename, contentType, size } = input;

    if (!isSafeResumeFilename(filename)) {
      throw new AppError(
        'A valid resume filename (pdf, doc, docx) is required',
        400
      );
    }

    const extension = extensionOf(String(filename).trim());
    if (!isAllowedResumeExtension(extension)) {
      throw new AppError('Only resume files (pdf, doc, docx) are allowed', 400);
    }

    // Some browsers send an empty MIME type; fall back to extension validation.
    const declaredMime =
      typeof contentType === 'string' && contentType.trim()
        ? contentType.trim().toLowerCase()
        : '';

    if (declaredMime) {
      if (!isAllowedResumeMimeType(declaredMime)) {
        throw new AppError('Resume content type is not allowed', 400);
      }
      if (!isAllowedResumeMimeForExtension(extension, declaredMime)) {
        throw new AppError(
          'Filename extension does not match the declared content type',
          400
        );
      }
    }

    if (size === undefined || size === null || size === '') {
      throw new AppError('File size is required', 400);
    }

    const numericSize = Number(size);
    if (!Number.isFinite(numericSize) || numericSize <= 0) {
      throw new AppError('File size is invalid', 400);
    }

    if (!isResumeSizeWithinLimit(numericSize)) {
      throw new AppError('Resume must be 5MB or smaller', 413);
    }

    return { extension, contentType: declaredMime || '' };
  }

  async createUploadUrl(
    input: CreateResumeUploadUrlInput
  ): Promise<CreateResumeUploadUrlResult> {
    const jobId = String(input.jobId ?? '').trim();
    if (!jobId) {
      throw new AppError('Job id is required', 400);
    }

    const { extension } = this.validate(input);

    if (!isSupabaseConfigured()) {
      throw new AppError('Resume upload is not available', 503);
    }

    const job = await prisma.jobPost.findFirst({
      where: { id: jobId },
      select: { isDeleted: true, isActive: true },
    });
    if (!job) {
      throw new AppError('Job not found', 404);
    }
    if (job.isDeleted || !job.isActive) {
      throw new AppError('This job is not accepting applications', 400);
    }

    // Server-generated path — never trust a client-provided path.
    const objectPath = `resumes/${crypto.randomUUID()}${extension}`;

    const signed = await createSignedResumeUploadUrl(objectPath);

    return {
      bucket: getResumeBucket(),
      path: signed.path,
      token: signed.token,
    };
  }
}

export const resumeUploadService = new ResumeUploadService();
