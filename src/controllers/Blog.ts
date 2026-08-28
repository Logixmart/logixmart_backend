import { Request, Response, NextFunction } from 'express';
import { blogService } from '../services/blogService';
import { parsePaginationQuery } from '../utils/pagination';

/**
 * Get all blogs
 * GET /api/blogs
 */
export const getBlogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page, limit } = parsePaginationQuery(req.query);
    const result = await blogService.list(page, limit);
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
 * Get a single blog by ID
 * GET /api/blogs/:id
 */
export const getBlogById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const blog = await blogService.getById(String(req.params.id));
    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new blog (image optional)
 * POST /api/blogs
 */
export const createBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, description } = req.body;
    const blog = await blogService.create({
      title,
      description,
      uploadedFilename: req.file?.filename,
      uploadedFilePath: req.file?.path,
    });

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing blog (image optional)
 * PUT /api/blogs/:id
 */
export const updateBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, description } = req.body;
    const blog = await blogService.update({
      id: String(req.params.id),
      title,
      description,
      uploadedFilename: req.file?.filename,
      uploadedFilePath: req.file?.path,
    });

    res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: blog,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a blog
 * DELETE /api/blogs/:id
 */
export const deleteBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await blogService.delete(String(req.params.id));
    res.status(200).json({
      success: true,
      message: 'Blog deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
