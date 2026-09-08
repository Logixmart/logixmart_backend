import { Request, Response, NextFunction } from 'express';
import { clientReviewService } from '../services/clientReviewService';

/**
 * Create client review (admin)
 * POST /api/client-reviews
 */
export const createClientReview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const review = await clientReviewService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Client review created successfully',
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List client reviews (public)
 * GET /api/client-reviews
 */
export const getClientReviews = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await clientReviewService.list(req.query);
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
 * Get single client review (public)
 * GET /api/client-reviews/:id
 */
export const getClientReviewById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const review = await clientReviewService.getById(String(req.params.id));
    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update client review (admin)
 * PATCH /api/client-reviews/:id
 */
export const updateClientReview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const review = await clientReviewService.update({
      id: String(req.params.id),
      ...req.body,
    });
    res.status(200).json({
      success: true,
      message: 'Client review updated successfully',
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete client review (admin)
 * DELETE /api/client-reviews/:id
 */
export const deleteClientReview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await clientReviewService.delete(String(req.params.id));
    res.status(200).json({
      success: true,
      message: 'Client review deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
