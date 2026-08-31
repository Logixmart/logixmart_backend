import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { fileStorage, FileStorage } from './storage';

const OUR_WORK_SELECT = {
  id: true,
  title: true,
  description: true,
  websiteUrl: true,
  appStoreUrl: true,
  playStoreUrl: true,
  images: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface OurWorkRow {
  id: string;
  title: string;
  description: string;
  websiteUrl: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OurWorkDto {
  id: string;
  title: string;
  description: string;
  websiteUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOurWorkInput {
  title?: string;
  description?: string;
  websiteUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  uploadedFilenames?: string[];
  uploadedFilePaths?: string[];
}

export interface UpdateOurWorkInput {
  id: string;
  title?: string;
  description?: string;
  websiteUrl?: string | null;
  appStoreUrl?: string | null;
  playStoreUrl?: string | null;
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
  work: OurWorkRow,
  storage: FileStorage = fileStorage
): OurWorkDto {
  return {
    id: work.id,
    title: work.title,
    description: work.description,
    ...(work.websiteUrl ? { websiteUrl: work.websiteUrl } : {}),
    ...(work.appStoreUrl ? { appStoreUrl: work.appStoreUrl } : {}),
    ...(work.playStoreUrl ? { playStoreUrl: work.playStoreUrl } : {}),
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
        select: OUR_WORK_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ourWork.count(),
    ]);

    return {
      data: (works as OurWorkRow[]).map((work) =>
        toOurWorkDto(work, this.storage)
      ),
      pagination: buildPaginationMeta(page, limit, total),
    };
  }

  async getById(id: string): Promise<OurWorkDto> {
    const work = (await prisma.ourWork.findUnique({
      where: { id },
      select: OUR_WORK_SELECT,
    })) as OurWorkRow | null;
    if (!work) {
      throw new AppError('Our work not found', 404);
    }
    return toOurWorkDto(work, this.storage);
  }

  async create(input: CreateOurWorkInput): Promise<OurWorkDto> {
    const title = input.title?.trim();
    const description = input.description?.trim();
    const websiteUrl = toOptionalUrl(input.websiteUrl) ?? null;
    const appStoreUrl = toOptionalUrl(input.appStoreUrl) ?? null;
    const playStoreUrl = toOptionalUrl(input.playStoreUrl) ?? null;

    if (!title || !description) {
      await this.cleanupUploadedFiles(input.uploadedFilePaths);
      throw new AppError('Title and description are required', 400);
    }

    const images = (input.uploadedFilenames ?? []).map((filename) =>
      this.storage.publicPathForFilename(filename, 'our-works')
    );

    try {
      const work = (await prisma.ourWork.create({
        data: {
          title,
          description,
          websiteUrl,
          appStoreUrl,
          playStoreUrl,
          images,
        },
        select: OUR_WORK_SELECT,
      })) as OurWorkRow;
      return toOurWorkDto(work, this.storage);
    } catch (error) {
      await this.cleanupUploadedFiles(input.uploadedFilePaths);
      throw error;
    }
  }

  async update(input: UpdateOurWorkInput): Promise<OurWorkDto> {
    const existing = (await prisma.ourWork.findUnique({
      where: { id: input.id },
      select: OUR_WORK_SELECT,
    })) as OurWorkRow | null;

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

    const nextWebsiteUrl =
      input.websiteUrl !== undefined
        ? toOptionalUrl(input.websiteUrl) ?? null
        : existing.websiteUrl;
    const nextAppStoreUrl =
      input.appStoreUrl !== undefined
        ? toOptionalUrl(input.appStoreUrl) ?? null
        : existing.appStoreUrl;
    const nextPlayStoreUrl =
      input.playStoreUrl !== undefined
        ? toOptionalUrl(input.playStoreUrl) ?? null
        : existing.playStoreUrl;

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
      const work = (await prisma.ourWork.update({
        where: { id: input.id },
        data: {
          title: nextTitle,
          description: nextDescription,
          websiteUrl: nextWebsiteUrl,
          appStoreUrl: nextAppStoreUrl,
          playStoreUrl: nextPlayStoreUrl,
          images: nextImages,
        },
        select: OUR_WORK_SELECT,
      })) as OurWorkRow;

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
    const existing = (await prisma.ourWork.findUnique({
      where: { id },
      select: { images: true },
    })) as { images: string[] } | null;
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
