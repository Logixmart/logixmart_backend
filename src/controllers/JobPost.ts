import { Request, Response, NextFunction } from 'express';
import { jobPostService } from '../services/jobPostService';

/**
 * Create Job Post
 * POST /api/job-posts
 */
export const createJobPost = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const job = await jobPostService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Job Posts
 * GET /api/job-posts
 */
export const getJobPosts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await jobPostService.list(req.query);
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
 * Get Single Job
 * GET /api/job-posts/:id
 */
export const getJobPostById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const job = await jobPostService.getById(String(req.params.id));
    res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Job
 * PATCH /api/job-posts/:id
 */
export const updateJobPost = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updatedJob = await jobPostService.update({
      id: String(req.params.id),
      ...req.body,
    });
    res.status(200).json({
      success: true,
      message: 'Job updated successfully',
      data: updatedJob,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Job
 * DELETE /api/job-posts/:id
 *
 * Soft delete
 */
export const deleteJobPost = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await jobPostService.delete(String(req.params.id));
    res.status(200).json({
      success: true,
      message: 'Job deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
