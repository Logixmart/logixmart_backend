import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { fileStorage } from '../services/storage';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ApplicationStatus =
  | 'PENDING'
  | 'REVIEWING'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'SELECTED'
  | 'REJECTED';

const ALLOWED_STATUSES: ApplicationStatus[] = [
  'PENDING',
  'REVIEWING',
  'SHORTLISTED',
  'INTERVIEW',
  'SELECTED',
  'REJECTED',
];

const JOB_SELECT = {
  id: true,
  title: true,
  companyName: true,
  location: true,
} as const;

function optionalTrim(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

async function cleanupResume(file?: Express.Multer.File): Promise<void> {
  if (!file?.filename) {
    return;
  }
  await fileStorage.deleteIfExists(
    fileStorage.publicPathForFilename(file.filename, 'resumes')
  );
}

function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}

/**
 * Apply for a job (public)
 * POST /api/job-posts/:jobId/applications
 */
export const createJobApplication = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const jobId = String(req.params.jobId);
    const applicantName = String(req.body.applicantName ?? '').trim();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const phone = optionalTrim(req.body.phone);
    const coverLetter = optionalTrim(req.body.coverLetter);
    const portfolioUrl = optionalTrim(req.body.portfolioUrl);
    const linkedinUrl = optionalTrim(req.body.linkedinUrl);

    if (!applicantName) {
      await cleanupResume(req.file);
      res.status(400).json({
        success: false,
        message: 'Applicant name is required',
      });
      return;
    }

    if (!email) {
      await cleanupResume(req.file);
      res.status(400).json({
        success: false,
        message: 'Email is required',
      });
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      await cleanupResume(req.file);
      res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
      return;
    }

    const job = await prisma.jobPost.findFirst({
      where: { id: jobId },
    });

    if (!job) {
      await cleanupResume(req.file);
      res.status(404).json({
        success: false,
        message: 'Job not found',
      });
      return;
    }

    if (job.isDeleted || !job.isActive) {
      await cleanupResume(req.file);
      res.status(400).json({
        success: false,
        message: 'This job is not accepting applications',
      });
      return;
    }

    const resumeUrl = req.file
      ? fileStorage.publicPathForFilename(req.file.filename, 'resumes')
      : null;

    try {
      const application = await prisma.jobApplication.create({
        data: {
          jobId,
          applicantName,
          email,
          phone,
          coverLetter,
          portfolioUrl,
          linkedinUrl,
          resumeUrl,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        data: {
          id: application.id,
          jobId: application.jobId,
          applicantName: application.applicantName,
          email: application.email,
          status: application.status,
          createdAt: application.createdAt,
        },
      });
    } catch (error) {
      await cleanupResume(req.file);

      if (isPrismaUniqueError(error)) {
        res.status(409).json({
          success: false,
          message: 'You have already applied for this job.',
        });
        return;
      }

      throw error;
    }
  } catch (error) {
    console.error('Create Job Application Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit application',
    });
  }
};

/**
 * List applications (admin)
 * GET /api/job-applications
 */
export const getJobApplications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '20',
      search = '',
      status,
      jobId,
    } = req.query;

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const where: {
      OR?: Array<{
        applicantName?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
      }>;
      status?: ApplicationStatus;
      jobId?: string;
    } = {};

    if (typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { applicantName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (typeof status === 'string' && status.trim()) {
      if (!ALLOWED_STATUSES.includes(status as ApplicationStatus)) {
        res.status(400).json({
          success: false,
          message: 'Invalid status filter',
        });
        return;
      }
      where.status = status as ApplicationStatus;
    }

    if (typeof jobId === 'string' && jobId.trim()) {
      where.jobId = jobId.trim();
    }

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

    res.status(200).json({
      success: true,
      data: applications,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber) || 1,
      },
    });
  } catch (error) {
    console.error('Get Job Applications Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
    });
  }
};

/**
 * Get application by ID (admin)
 * GET /api/job-applications/:id
 */
export const getJobApplicationById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: { job: { select: JOB_SELECT } },
    });

    if (!application) {
      res.status(404).json({
        success: false,
        message: 'Application not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error('Get Job Application Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application',
    });
  }
};

/**
 * Update application status (admin)
 * PATCH /api/job-applications/:id/status
 */
export const updateJobApplicationStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const status = String(req.body.status ?? '').trim().toUpperCase();

    if (!ALLOWED_STATUSES.includes(status as ApplicationStatus)) {
      res.status(400).json({
        success: false,
        message:
          'Invalid status. Allowed values: PENDING, REVIEWING, SHORTLISTED, INTERVIEW, SELECTED, REJECTED',
      });
      return;
    }

    const existing = await prisma.jobApplication.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Application not found',
      });
      return;
    }

    const updated = await prisma.jobApplication.update({
      where: { id },
      data: { status: status as ApplicationStatus },
      include: { job: { select: JOB_SELECT } },
    });

    res.status(200).json({
      success: true,
      message: 'Application status updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update Application Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update application status',
    });
  }
};

/**
 * Delete application (admin)
 * DELETE /api/job-applications/:id
 */
export const deleteJobApplication = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.jobApplication.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Application not found',
      });
      return;
    }

    await prisma.jobApplication.delete({ where: { id } });
    await fileStorage.deleteIfExists(existing.resumeUrl);

    res.status(200).json({
      success: true,
      message: 'Application deleted successfully',
    });
  } catch (error) {
    console.error('Delete Job Application Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete application',
    });
  }
};
