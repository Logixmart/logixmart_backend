import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import { backupBlogs, backupInBackground } from '../lib/jsonBackup';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { fileStorage, FileStorage } from './storage';

type Blog = NonNullable<Awaited<ReturnType<typeof prisma.blog.findFirst>>>;

export interface BlogDto {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlogInput {
  title?: string;
  description?: string;
  uploadedFilename?: string;
  uploadedFilePath?: string;
}

export interface UpdateBlogInput {
  id: string;
  title?: string;
  description?: string;
  uploadedFilename?: string;
  uploadedFilePath?: string;
  removeImage?: boolean;
}

function toBlogDto(blog: Blog, storage: FileStorage = fileStorage): BlogDto {
  return {
    id: blog.id,
    title: blog.title,
    description: blog.description,
    ...(blog.imageUrl
      ? { imageUrl: storage.getPublicUrl(blog.imageUrl) }
      : {}),
    createdAt: blog.createdAt.toISOString(),
    updatedAt: blog.updatedAt.toISOString(),
  };
}

export interface PaginatedBlogs {
  data: BlogDto[];
  pagination: PaginationMeta;
}

export class BlogService {
  constructor(private readonly storage: FileStorage = fileStorage) {}

  async list(page = 1, limit = 20): Promise<PaginatedBlogs> {
    const skip = (page - 1) * limit;

    const [blogs, total] = await Promise.all([
      prisma.blog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.blog.count(),
    ]);

    return {
      data: blogs.map((blog) => toBlogDto(blog, this.storage)),
      pagination: buildPaginationMeta(page, limit, total),
    };
  }

  async getById(id: string): Promise<BlogDto> {
    const blog = await prisma.blog.findUnique({ where: { id } });
    if (!blog) {
      throw new AppError('Blog not found', 404);
    }
    return toBlogDto(blog, this.storage);
  }

  async create(input: CreateBlogInput): Promise<BlogDto> {
    const title = input.title?.trim();
    const description = input.description?.trim();

    if (!title || !description) {
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw new AppError('Title and description are required', 400);
    }

    const imageUrl = input.uploadedFilename
      ? this.storage.publicPathForFilename(input.uploadedFilename)
      : undefined;

    try {
      const blog = await prisma.blog.create({
        data: {
          title,
          description,
          imageUrl: imageUrl ?? null,
        },
      });
      backupInBackground(backupBlogs, 'blogs');
      return toBlogDto(blog, this.storage);
    } catch (error) {
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw error;
    }
  }

  // async update(input: UpdateBlogInput): Promise<BlogDto> {
  //   const existing = await prisma.blog.findUnique({ where: { id: input.id } });

  //   if (!existing) {
  //     await this.cleanupUploadedFile(input.uploadedFilePath);
  //     throw new AppError('Blog not found', 404);
  //   }

  //   const nextTitle =
  //     input.title !== undefined ? input.title.trim() : existing.title;
  //   const nextDescription =
  //     input.description !== undefined
  //       ? input.description.trim()
  //       : existing.description;

  //   if (!nextTitle || !nextDescription) {
  //     await this.cleanupUploadedFile(input.uploadedFilePath);
  //     throw new AppError('Title and description cannot be empty', 400);
  //   }

  //   let nextImageUrl = existing.imageUrl;
  //   const previousImageUrl = existing.imageUrl;

  //   if (input.uploadedFilename) {
  //     nextImageUrl = this.storage.publicPathForFilename(input.uploadedFilename);
  //   }

  //   try {
  //     const blog = await prisma.blog.update({
  //       where: { id: input.id },
  //       data: {
  //         title: nextTitle,
  //         description: nextDescription,
  //         imageUrl: nextImageUrl,
  //       },
  //     });

  //     // Only delete the previous image after a successful DB update
  //     if (input.uploadedFilename && previousImageUrl && previousImageUrl !== nextImageUrl) {
  //       await this.storage.deleteIfExists(previousImageUrl);
  //     }

  //     backupInBackground(backupBlogs, 'blogs');
  //     return toBlogDto(blog, this.storage);
  //   } catch (error) {
  //     await this.cleanupUploadedFile(input.uploadedFilePath);
  //     throw error;
  //   }
  // }
  
  async update(input: UpdateBlogInput): Promise<BlogDto> {
    const existing = await prisma.blog.findUnique({ where: { id: input.id } });
  
    if (!existing) {
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw new AppError('Blog not found', 404);
    }
  
    const nextTitle =
      input.title !== undefined ? input.title.trim() : existing.title;
    const nextDescription =
      input.description !== undefined
        ? input.description.trim()
        : existing.description;
  
    if (!nextTitle || !nextDescription) {
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw new AppError('Title and description cannot be empty', 400);
    }
  
    // Store the old image URL reference before calculating changes
    const previousImageUrl = existing.imageUrl;
    let nextImageUrl: string | null = existing.imageUrl;
  
    // 1. New file uploaded -> set new URL
    if (input.uploadedFilename) {
      nextImageUrl = this.storage.publicPathForFilename(input.uploadedFilename);
    } 
    // 2. Explicit request to remove existing image -> set to null
    else if (input.removeImage) {
      nextImageUrl = null;
    }
  
    try {
      const blog = await prisma.blog.update({
        where: { id: input.id },
        data: {
          title: nextTitle,
          description: nextDescription,
          imageUrl: nextImageUrl,
        },
      });
  
      // Delete the previous file if it was explicitly replaced or deleted
      const imageWasChanged = previousImageUrl !== null && nextImageUrl !== previousImageUrl;
  
      if (imageWasChanged) {
        await this.storage.deleteIfExists(previousImageUrl);
      }
  
      backupInBackground(backupBlogs, 'blogs');
      return toBlogDto(blog, this.storage);
    } catch (error) {
      // Clean up newly uploaded file if database update fails
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.blog.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Blog not found', 404);
    }

    await prisma.blog.delete({ where: { id } });
    await this.storage.deleteIfExists(existing.imageUrl);
    backupInBackground(backupBlogs, 'blogs');
  }

  private async cleanupUploadedFile(filePath?: string): Promise<void> {
    if (!filePath) {
      return;
    }
    const filename = filePath.split(/[/\\]/).pop();
    if (!filename) {
      return;
    }
    await this.storage.deleteIfExists(
      this.storage.publicPathForFilename(filename)
    );
  }
}

export const blogService = new BlogService();
