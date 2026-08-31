import { Request, Response, NextFunction } from 'express';
import { ourWorkService } from '../services/ourWorkService';
import { parsePaginationQuery } from '../utils/pagination';

function parseRemoveImages(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      // Comma-separated fallback
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return undefined;
}

function uploadedFiles(req: Request): Express.Multer.File[] {
  if (Array.isArray(req.files)) {
    return req.files;
  }
  return [];
}

/**
 * Get all our works
 * GET /api/our-works
 */
export const getOurWorks = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page, limit } = parsePaginationQuery(req.query);
    const result = await ourWorkService.list(page, limit);
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
 * Get a single our work by ID
 * GET /api/our-works/:id
 */
export const getOurWorkById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const work = await ourWorkService.getById(String(req.params.id));
    res.status(200).json({
      success: true,
      data: work,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new our work (images optional)
 * POST /api/our-works
 */
export const createOurWork = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, description, websiteUrl, appStoreUrl, playStoreUrl } = req.body;
    const files = uploadedFiles(req);

    const work = await ourWorkService.create({
      title,
      description,
      websiteUrl,
      appStoreUrl,
      playStoreUrl,
      uploadedFilenames: files.map((file) => file.filename),
      uploadedFilePaths: files.map((file) => file.path),
    });

    res.status(201).json({
      success: true,
      message: 'Our work created successfully',
      data: work,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing our work (images optional)
 * PUT /api/our-works/:id
 */
export const updateOurWork = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, description, websiteUrl, appStoreUrl, playStoreUrl, removeImages } =
      req.body;
    const files = uploadedFiles(req);

    const work = await ourWorkService.update({
      id: String(req.params.id),
      title,
      description,
      websiteUrl,
      appStoreUrl,
      playStoreUrl,
      removeImages: parseRemoveImages(removeImages),
      uploadedFilenames: files.map((file) => file.filename),
      uploadedFilePaths: files.map((file) => file.path),
    });

    res.status(200).json({
      success: true,
      message: 'Our work updated successfully',
      data: work,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an our work
 * DELETE /api/our-works/:id
 */
export const deleteOurWork = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await ourWorkService.delete(String(req.params.id));
    res.status(200).json({
      success: true,
      message: 'Our work deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
