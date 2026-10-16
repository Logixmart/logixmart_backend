import { Request, Response, NextFunction } from 'express';
import { jobApplicationService } from '../services/jobApplicationService';
import { resumeUploadService } from '../services/resumeUploadService';

/**
 * Create a signed Supabase upload URL for a resume (public applicant).
 * POST /api/job-posts/:jobId/applications/resume/upload-url
 *
 * The backend generates the object path; the applicant uploads the file bytes
 * directly to the private bucket and then submits the returned path.
 */
export const createJobApplicationResumeUploadUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await resumeUploadService.createUploadUrl({
      jobId: req.params.jobId,
      filename: req.body?.filename,
      contentType: req.body?.contentType,
      size: req.body?.size,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Apply for a job (public)
 * POST /api/job-posts/:jobId/applications
 */
export const createJobApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const application = await jobApplicationService.create({
      jobId: String(req.params.jobId),
      ...req.body,
      uploadedFilename: req.file?.filename,
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List applications (admin)
 * GET /api/job-applications
 */
export const getJobApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await jobApplicationService.list(req.query);
    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get application by ID (admin)
 * GET /api/job-applications/:id
 */
export const getJobApplicationById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const application = await jobApplicationService.getById(
      String(req.params.id)
    );
    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update application status (admin)
 * PATCH /api/job-applications/:id/status
 */
export const updateJobApplicationStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updated = await jobApplicationService.updateStatus(
      String(req.params.id),
      req.body.status
    );
    res.status(200).json({
      success: true,
      message: 'Application status updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete application (admin)
 * DELETE /api/job-applications/:id
 */
export const deleteJobApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await jobApplicationService.delete(String(req.params.id));
    res.status(200).json({
      success: true,
      message: 'Application deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download application resume (admin only)
 * GET /api/job-applications/:id/resume
 */
export const downloadJobApplicationResume = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const info = await jobApplicationService.getResumeDownloadInfo(
      String(req.params.id)
    );

    if (info.buffer) {
      res.setHeader(
        'Content-Type',
        info.contentType || 'application/octet-stream'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${info.filename.replace(/"/g, '')}"`
      );
      res.send(info.buffer);
      return;
    }

    if (info.filePath) {
      res.download(info.filePath, info.filename);
      return;
    }

    next(new Error('Resume file not available'));
  } catch (error) {
    next(error);
  }
};
