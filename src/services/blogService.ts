import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { imageStorage, FileStorage } from './storage';
import { resolveImageObjectPath } from '../utils/imagePaths';
import { getImageBucket } from './storage/supabaseImageObjects';
import fs from 'fs';

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
  /** Supabase object path (e.g. `blogs/<uuid>.jpg`) from the direct upload flow. */
  imageObjectPath?: unknown;
}

export interface UpdateBlogInput {
  id: string;
  title?: string;
  description?: string;
  uploadedFilename?: string;
  uploadedFilePath?: string;
  /** Replacement Supabase object path (e.g. `blogs/<uuid>.jpg`). */
  imageObjectPath?: unknown;
  removeImage?: boolean;
}

function toBlogDto(blog: Blog, storage: FileStorage = imageStorage): BlogDto {
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
  constructor(private readonly storage: FileStorage = imageStorage) {}

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

    const hasFile = Boolean(input.uploadedFilename && input.uploadedFilePath);
    const hasObjectPath =
      input.imageObjectPath !== undefined && input.imageObjectPath !== null &&
      input.imageObjectPath !== '';

    if (hasFile && hasObjectPath) {
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw new AppError(
        'Provide either an uploaded image or an image path, not both',
        400
      );
    }

    if (!title || !description) {
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw new AppError('Title and description are required', 400);
    }

    let imageUrl: string | undefined;
    try {
      if (hasObjectPath) {
        imageUrl = await this.resolveBlogImagePath(input.imageObjectPath);
      } else if (hasFile) {
        imageUrl = await this.storage.persistLocalUpload(
          input.uploadedFilePath as string,
          input.uploadedFilename as string,
          'blogs'
        );
      }

      const blog = await prisma.blog.create({
        data: {
          title,
          description,
          imageUrl: imageUrl ?? null,
        },
      });
      return toBlogDto(blog, this.storage);
    } catch (error) {
      await this.cleanupUploadedFile(
        input.uploadedFilePath,
        input.uploadedFilename
      );
      if (imageUrl && !hasObjectPath) {
        await this.storage.deleteIfExists(imageUrl);
      }
      throw error;
    }
  }

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

    const hasFile = Boolean(input.uploadedFilename && input.uploadedFilePath);
    const hasObjectPath =
      input.imageObjectPath !== undefined && input.imageObjectPath !== null &&
      input.imageObjectPath !== '';
    const shouldRemoveImage = input.removeImage === true;

    // Reject conflicting image instructions instead of guessing intent.
    if (hasObjectPath && shouldRemoveImage) {
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw new AppError(
        'Cannot replace and remove the image in the same request',
        400
      );
    }

    if (hasFile && hasObjectPath) {
      await this.cleanupUploadedFile(input.uploadedFilePath);
      throw new AppError(
        'Provide either an uploaded image or an image path, not both',
        400
      );
    }
  
    const previousImageUrl = existing.imageUrl;
    let nextImageUrl: string | null = existing.imageUrl;
    let newlyPersistedPath: string | undefined;
    let persistedLegacy = false;

    try {
      if (hasFile) {
        newlyPersistedPath = await this.storage.persistLocalUpload(
          input.uploadedFilePath as string,
          input.uploadedFilename as string,
          'blogs'
        );
        nextImageUrl = newlyPersistedPath;
        persistedLegacy = true;
      } else if (hasObjectPath) {
        nextImageUrl = await this.resolveBlogImagePath(input.imageObjectPath);
      } else if (shouldRemoveImage) {
        nextImageUrl = null;
      }

      const blog = await prisma.blog.update({
        where: { id: input.id },
        data: {
          title: nextTitle,
          description: nextDescription,
          imageUrl: nextImageUrl,
        },
      });

      const imageWasChanged =
        previousImageUrl !== null && nextImageUrl !== previousImageUrl;

      if (imageWasChanged) {
        await this.storage.deleteIfExists(previousImageUrl);
      }

      return toBlogDto(blog, this.storage);
    } catch (error) {
      await this.cleanupUploadedFile(
        input.uploadedFilePath,
        input.uploadedFilename
      );
      if (newlyPersistedPath && persistedLegacy) {
        await this.storage.deleteIfExists(newlyPersistedPath);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.blog.findUnique({
      where: { id },
      select: { imageUrl: true },
    });
    if (!existing) {
      throw new AppError('Blog not found', 404);
    }

    await prisma.blog.delete({ where: { id } });
    await this.storage.deleteIfExists(existing.imageUrl);
  }

  private async resolveBlogImagePath(value: unknown): Promise<string> {
    const resolved = resolveImageObjectPath(value, 'blogs', getImageBucket());
    if (!resolved) {
      throw new AppError('Invalid blog image path', 400);
    }

    const exists = await this.storage.exists(resolved);
    if (!exists) {
      throw new AppError('Uploaded blog image was not found in storage', 400);
    }

    return resolved;
  }

  private async cleanupUploadedFile(
    filePath?: string,
    filename?: string
  ): Promise<void> {
    if (filePath) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      } catch {
        // ignore
      }
    }
    if (filename) {
      await this.storage.deleteIfExists(
        this.storage.publicPathForFilename(filename, 'blogs')
      );
    }
  }
}

export const blogService = new BlogService();
