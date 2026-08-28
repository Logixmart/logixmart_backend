import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { fileStorage, FileStorage } from './storage';

type OurWork = NonNullable<Awaited<ReturnType<typeof prisma.ourWork.findFirst>>>;

export interface OurWorkDto {
  id: string;
  title: string;
  description: string;
  projectUrl?: string;
  webAppUrl?: string;
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOurWorkInput {
  title?: string;
  description?: string;
  projectUrl?: string;
  webAppUrl?: string;
  uploadedFilenames?: string[];
  uploadedFilePaths?: string[];
}

export interface UpdateOurWorkInput {
  id: string;
  title?: string;
  description?: string;
  projectUrl?: string | null;
  webAppUrl?: string | null;
  uploadedFilenames?: string[];
  uploadedFilePaths?: string[];
  /** Relative paths or public URLs of images to remove */
  removeImages?: string[];
}

function toOptionalUrl(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStoredPath(
  value: string,
  storage: FileStorage
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  // Accept absolute public URLs and strip the API base to get the stored path
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      return url.pathname;
    }
  } catch {
    // fall through
  }

  if (trimmed.startsWith('/uploads/')) {
    return trimmed;
  }

  // Treat bare filenames as our-works paths
  return storage.publicPathForFilename(trimmed, 'our-works');
}

function toOurWorkDto(
  work: OurWork,
  storage: FileStorage = fileStorage
): OurWorkDto {
  return {
    id: work.id,
    title: work.title,
    description: work.description,
    ...(work.projectUrl ? { projectUrl: work.projectUrl } : {}),
    ...(work.webAppUrl ? { webAppUrl: work.webAppUrl } : {}),
    images: work.images.map((path) => storage.getPublicUrl(path)),
    createdAt: work.createdAt.toISOString(),
    updatedAt: work.updatedAt.toISOString(),
  };
}

export interface PaginatedOurWorks {
  data: OurWorkDto[];
  pagination: PaginationMeta;
}

export class OurWorkService {
  constructor(private readonly storage: FileStorage = fileStorage) {}

  async list(page = 1, limit = 20): Promise<PaginatedOurWorks> {
    const skip = (page - 1) * limit;

    const [works, total] = await Promise.all([
      prisma.ourWork.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ourWork.count(),
    ]);

    return {
      data: works.map((work) => toOurWorkDto(work, this.storage)),
      pagination: buildPaginationMeta(page, limit, total),
    };
  }

  async getById(id: string): Promise<OurWorkDto> {
    const work = await prisma.ourWork.findUnique({ where: { id } });
    if (!work) {
      throw new AppError('Our work not found', 404);
    }
    return toOurWorkDto(work, this.storage);
  }

  async create(input: CreateOurWorkInput): Promise<OurWorkDto> {
    const title = input.title?.trim();
    const description = input.description?.trim();
    const projectUrl = toOptionalUrl(input.projectUrl) ?? null;
    const webAppUrl = toOptionalUrl(input.webAppUrl) ?? null;

    if (!title || !description) {
      await this.cleanupUploadedFiles(input.uploadedFilePaths);
      throw new AppError('Title and description are required', 400);
    }

    const images = (input.uploadedFilenames ?? []).map((filename) =>
      this.storage.publicPathForFilename(filename, 'our-works')
    );

    try {
      const work = await prisma.ourWork.create({
        data: {
          title,
          description,
          projectUrl,
          webAppUrl,
          images,
        },
      });
      return toOurWorkDto(work, this.storage);
    } catch (error) {
      await this.cleanupUploadedFiles(input.uploadedFilePaths);
      throw error;
    }
  }

  async update(input: UpdateOurWorkInput): Promise<OurWorkDto> {
    const existing = await prisma.ourWork.findUnique({
      where: { id: input.id },
    });

    if (!existing) {
      await this.cleanupUploadedFiles(input.uploadedFilePaths);
      throw new AppError('Our work not found', 404);
    }

    const nextTitle =
      input.title !== undefined ? input.title.trim() : existing.title;
    const nextDescription =
      input.description !== undefined
        ? input.description.trim()
        : existing.description;

    if (!nextTitle || !nextDescription) {
      await this.cleanupUploadedFiles(input.uploadedFilePaths);
      throw new AppError('Title and description cannot be empty', 400);
    }

    const nextProjectUrl =
      input.projectUrl !== undefined
        ? toOptionalUrl(input.projectUrl) ?? null
        : existing.projectUrl;
    const nextWebAppUrl =
      input.webAppUrl !== undefined
        ? toOptionalUrl(input.webAppUrl) ?? null
        : existing.webAppUrl;

    const removeSet = new Set(
      (input.removeImages ?? [])
        .map((value) => normalizeStoredPath(value, this.storage))
        .filter(Boolean)
    );

    const retainedImages = existing.images.filter(
      (path) => !removeSet.has(path)
    );
    const addedImages = (input.uploadedFilenames ?? []).map((filename) =>
      this.storage.publicPathForFilename(filename, 'our-works')
    );
    const nextImages = [...retainedImages, ...addedImages];
    const removedImages = existing.images.filter((path) =>
      removeSet.has(path)
    );

    try {
      const work = await prisma.ourWork.update({
        where: { id: input.id },
        data: {
          title: nextTitle,
          description: nextDescription,
          projectUrl: nextProjectUrl,
          webAppUrl: nextWebAppUrl,
          images: nextImages,
        },
      });

      await Promise.all(
        removedImages.map((path) => this.storage.deleteIfExists(path))
      );

      return toOurWorkDto(work, this.storage);
    } catch (error) {
      await this.cleanupUploadedFiles(input.uploadedFilePaths);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.ourWork.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Our work not found', 404);
    }

    await prisma.ourWork.delete({ where: { id } });
    await Promise.all(
      existing.images.map((path) => this.storage.deleteIfExists(path))
    );
  }

  private async cleanupUploadedFiles(filePaths?: string[]): Promise<void> {
    if (!filePaths?.length) {
      return;
    }

    await Promise.all(
      filePaths.map(async (filePath) => {
        const filename = filePath.split(/[/\\]/).pop();
        if (!filename) {
          return;
        }
        await this.storage.deleteIfExists(
          this.storage.publicPathForFilename(filename, 'our-works')
        );
      })
    );
  }
}

export const ourWorkService = new OurWorkService();
