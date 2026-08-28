import { Request, Response, NextFunction } from 'express';
import { jobApplicationService } from '../services/jobApplicationService';

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
    const { filePath, filename } =
      await jobApplicationService.getResumeDownloadInfo(String(req.params.id));
    res.download(filePath, filename);
  } catch (error) {
    next(error);
  }
};
