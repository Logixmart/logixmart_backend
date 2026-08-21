import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { authenticateAdmin } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();
const DB_PATH = path.join(__dirname, '../data/blogs.json');

// Interface for Blog
export interface Blog {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

// Helpers for Reading/Writing to blogs.json
const readBlogs = (): Blog[] => {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return [];
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error reading blogs DB:', error);
    return [];
  }
};

const writeBlogs = (blogs: Blog[]): void => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(blogs, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing to blogs DB:', error);
  }
};

// 1. GET /api/blogs - Get all blogs (Public)
router.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const blogs = readBlogs();
    // Return newest blogs first
    const sortedBlogs = [...blogs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.status(200).json({
      success: true,
      count: sortedBlogs.length,
      data: sortedBlogs,
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /api/blogs/:id - Get a single blog by ID (Public)
router.get('/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const blogs = readBlogs();
    const blog = blogs.find((b) => b.id === req.params.id);

    if (!blog) {
      res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    next(error);
  }
});

// 3. POST /api/blogs - Create a new blog (Admin Only, Image Upload Required)
router.post(
  '/',
  authenticateAdmin,
  upload.single('image'),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { title, description } = req.body;

      // Validate inputs
      if (!title || !description) {
        // If image uploaded, clean it up since validation failed
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        res.status(400).json({
          success: false,
          message: 'Title and description are required',
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'Blog image is required',
        });
        return;
      }

      const blogs = readBlogs();

      // Formulate image URL (assuming server runs on http://localhost:PORT)
      // Save path relative to domain, e.g. /uploads/filename.jpg
      const imageUrl = `/uploads/${req.file.filename}`;

      const newBlog: Blog = {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        imageUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      blogs.push(newBlog);
      writeBlogs(blogs);

      res.status(201).json({
        success: true,
        message: 'Blog created successfully',
        data: newBlog,
      });
    } catch (error) {
      // Clean up uploaded file if an error occurs
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error('Failed to delete file on error:', err);
        }
      }
      next(error);
    }
  }
);

// 4. PUT /api/blogs/:id - Update an existing blog (Admin Only, Image Optional)
router.put(
  '/:id',
  authenticateAdmin,
  upload.single('image'),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { id } = req.params;
      const { title, description } = req.body;

      const blogs = readBlogs();
      const blogIndex = blogs.findIndex((b) => b.id === id);

      if (blogIndex === -1) {
        // If image uploaded, clean it up
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        res.status(404).json({
          success: false,
          message: 'Blog not found',
        });
        return;
      }

      const existingBlog = blogs[blogIndex];
      let imageUrl = existingBlog.imageUrl;
      let oldImageToDelete: string | null = null;

      // If a new image is uploaded, prepare to delete the old one
      if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
        // Extract original image file name to delete later on success
        if (existingBlog.imageUrl.startsWith('/uploads/')) {
          oldImageToDelete = path.join(__dirname, '../..', existingBlog.imageUrl);
        }
      }

      const updatedBlog: Blog = {
        ...existingBlog,
        title: title !== undefined ? title.trim() : existingBlog.title,
        description: description !== undefined ? description.trim() : existingBlog.description,
        imageUrl,
        updatedAt: new Date().toISOString(),
      };

      // Perform validation check
      if (!updatedBlog.title || !updatedBlog.description) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        res.status(400).json({
          success: false,
          message: 'Title and description cannot be empty',
        });
        return;
      }

      blogs[blogIndex] = updatedBlog;
      writeBlogs(blogs);

      // Clean up old image from filesystem if a new one was uploaded successfully
      if (oldImageToDelete) {
        try {
          if (fs.existsSync(oldImageToDelete)) {
            fs.unlinkSync(oldImageToDelete);
          }
        } catch (err) {
          console.error('Failed to delete old image file:', err);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Blog updated successfully',
        data: updatedBlog,
      });
    } catch (error) {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error('Failed to delete file on error:', err);
        }
      }
      next(error);
    }
  }
);

// 5. DELETE /api/blogs/:id - Delete a blog (Admin Only)
router.delete(
  '/:id',
  authenticateAdmin,
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { id } = req.params;
      const blogs = readBlogs();
      const blogIndex = blogs.findIndex((b) => b.id === id);

      if (blogIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'Blog not found',
        });
        return;
      }

      const blogToDelete = blogs[blogIndex];

      // Remove from list
      blogs.splice(blogIndex, 1);
      writeBlogs(blogs);

      // Delete image file from server
      if (blogToDelete.imageUrl.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, '../..', blogToDelete.imageUrl);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.error('Failed to delete image file during blog deletion:', err);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Blog deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
