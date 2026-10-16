import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import { imageUploadService } from '../services/imageUploadService';

const IMAGE_MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN'];

/**
 * Create a signed Supabase upload URL for a compressed image.
 * POST /api/storage/upload-url
 *
 * The backend generates the object path; the client uploads the file bytes
 * directly to Supabase Storage and then submits the returned path.
 */
export const createUploadUrl = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || !IMAGE_MANAGER_ROLES.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to upload images',
      });
      return;
    }

    const result = await imageUploadService.createUploadUrl({
      folder: req.body?.folder,
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
