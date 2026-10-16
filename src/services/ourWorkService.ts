import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import fs from 'fs';
import { imageStorage, FileStorage } from './storage';
import {
  objectPathFromSupabasePublicUrl,
  resolveImageObjectPath,
} from '../utils/imagePaths';
import { getImageBucket } from './storage/supabaseImageObjects';
import { MAX_OUR_WORK_IMAGES } from '../constants/images';

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
  category: true,
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
  category: string;
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
  category: string;
}

export interface CreateOurWorkInput {
  title?: string;
  description?: string;
  websiteUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  uploadedFilenames?: string[];
  uploadedFilePaths?: string[];
  /** New Supabase object paths (`our-works/<uuid>.png`) from direct uploads. */
  imageObjectPaths?: unknown;
  category: string;
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
  /** New Supabase object paths (`our-works/<uuid>.png`) to append. */
  imageObjectPaths?: unknown;
  /** Stored paths or public URLs of images to remove */
  removeImages?: string[];
  category: string;
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

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const supabaseObjectPath = objectPathFromSupabasePublicUrl(
        trimmed,
        getImageBucket()
      );
      if (supabaseObjectPath) {
        return supabaseObjectPath;
      }
      const url = new URL(trimmed);
      // Legacy API-hosted uploads
      if (url.pathname.startsWith('/uploads/')) {
        return url.pathname;
      }
      return url.pathname.replace(/^\/+/, '');
    }
  } catch {
    // fall through
  }

  if (trimmed.startsWith('/uploads/')) {
    return trimmed;
  }

  if (trimmed.startsWith('our-works/') || trimmed.startsWith('blogs/')) {
    return trimmed;
  }

  return storage.publicPathForFilename(trimmed, 'our-works');
}

function toOurWorkDto(
  work: OurWorkRow,
  storage: FileStorage = imageStorage
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
    category: work.category,
  };
}

export interface PaginatedOurWorks {
  data: OurWorkDto[];
  pagination: PaginationMeta;
}

export class OurWorkService {
  constructor(private readonly storage: FileStorage = imageStorage) {}

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
    const category = input.category;
    if (!title || !description) {
      await this.cleanupUploadedFiles(
        input.uploadedFilePaths,
        input.uploadedFilenames
      );
      throw new AppError('Title and description are required', 400);
    }

    let images: string[] = [];
    try {
      const objectImages = await this.resolveNewImagePaths(
        input.imageObjectPaths
      );
      const legacyImages = await this.persistUploads(
        input.uploadedFilenames,
        input.uploadedFilePaths
      );

      images = this.dedupeImages([...objectImages, ...legacyImages]);
      this.assertImageLimit(images);

      const work = (await prisma.ourWork.create({
        data: {
          title,
          description,
          websiteUrl,
          appStoreUrl,
          playStoreUrl,
          images,
          category,
        },
        select: OUR_WORK_SELECT,
      })) as OurWorkRow;
      return toOurWorkDto(work, this.storage);
    } catch (error) {
      await this.cleanupUploadedFiles(
        input.uploadedFilePaths,
        input.uploadedFilenames
      );
      await Promise.all(images.map((path) => this.storage.deleteIfExists(path)));
      throw error;
    }
  }

  async update(input: UpdateOurWorkInput): Promise<OurWorkDto> {
    const existing = (await prisma.ourWork.findUnique({
      where: { id: input.id },
      select: OUR_WORK_SELECT,
    })) as OurWorkRow | null;

    if (!existing) {
      await this.cleanupUploadedFiles(
        input.uploadedFilePaths,
        input.uploadedFilenames
      );
      throw new AppError('Our work not found', 404);
    }

    const nextTitle =
      input.title !== undefined ? input.title.trim() : existing.title;
    const nextDescription =
      input.description !== undefined
        ? input.description.trim()
        : existing.description;

    if (!nextTitle || !nextDescription) {
      await this.cleanupUploadedFiles(
        input.uploadedFilePaths,
        input.uploadedFilenames
      );
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
    const category = input.category;
    const removeSet = new Set(
      (input.removeImages ?? [])
        .map((value) => normalizeStoredPath(value, this.storage))
        .filter(Boolean)
    );

    const retainedImages = existing.images.filter(
      (path) => !removeSet.has(path)
    );
    const removedImages = existing.images.filter((path) =>
      removeSet.has(path)
    );

    let nextImages: string[] = retainedImages;
    let addedImages: string[] = [];
    try {
      const objectImages = await this.resolveNewImagePaths(
        input.imageObjectPaths
      );
      const legacyImages = await this.persistUploads(
        input.uploadedFilenames,
        input.uploadedFilePaths
      );
      addedImages = [...objectImages, ...legacyImages];

      // Preserve existing order, then append new paths in submitted order.
      nextImages = this.dedupeImages([...retainedImages, ...addedImages]);
      this.assertImageLimit(nextImages);

      const work = (await prisma.ourWork.update({
        where: { id: input.id },
        data: {
          title: nextTitle,
          description: nextDescription,
          websiteUrl: nextWebsiteUrl,
          appStoreUrl: nextAppStoreUrl,
          playStoreUrl: nextPlayStoreUrl,
          images: nextImages,
          category,
        },
        select: OUR_WORK_SELECT,
      })) as OurWorkRow;

      await Promise.all(
        removedImages.map((path) => this.storage.deleteIfExists(path))
      );

      return toOurWorkDto(work, this.storage);
    } catch (error) {
      await this.cleanupUploadedFiles(
        input.uploadedFilePaths,
        input.uploadedFilenames
      );
      await Promise.all(
        addedImages.map((path) => this.storage.deleteIfExists(path))
      );
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

  private async resolveNewImagePaths(value: unknown): Promise<string[]> {
    if (value === undefined || value === null || value === '') {
      return [];
    }

    const list = Array.isArray(value) ? value : [value];

    // Validate + dedupe synchronously (preserving submitted order, throwing on
    // the first invalid path) before doing any network calls.
    const resolved: string[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      // Only this feature's prefix is accepted; rejects traversal,
      // other-feature paths, local paths and external URLs.
      const path = resolveImageObjectPath(item, 'our-works', getImageBucket());
      if (!path) {
        throw new AppError('Invalid our works image path', 400);
      }
      if (seen.has(path)) {
        continue;
      }
      seen.add(path);
      resolved.push(path);
    }

    // Verify existence in parallel (read-only checks).
    const existence = await Promise.all(
      resolved.map((path) => this.storage.exists(path))
    );
    if (existence.some((exists) => !exists)) {
      throw new AppError(
        'Uploaded our works image was not found in storage',
        400
      );
    }

    return resolved;
  }

  private dedupeImages(paths: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const path of paths) {
      if (!path || seen.has(path)) {
        continue;
      }
      seen.add(path);
      result.push(path);
    }
    return result;
  }

  private assertImageLimit(images: string[]): void {
    if (images.length > MAX_OUR_WORK_IMAGES) {
      throw new AppError(
        `A maximum of ${MAX_OUR_WORK_IMAGES} images is allowed`,
        400
      );
    }
  }

  private async persistUploads(
    filenames?: string[],
    filePaths?: string[]
  ): Promise<string[]> {
    if (!filenames?.length || !filePaths?.length) {
      return [];
    }

    // Persist uploads in parallel; results keep the submitted order.
    const stored = await Promise.all(
      filenames.map((filename, i) =>
        filename && filePaths[i]
          ? this.storage.persistLocalUpload(
              filePaths[i],
              filename,
              'our-works'
            )
          : Promise.resolve(null)
      )
    );

    return stored.filter((path): path is string => Boolean(path));
  }

  private async cleanupUploadedFiles(
    filePaths?: string[],
    filenames?: string[]
  ): Promise<void> {
    if (filePaths?.length) {
      await Promise.all(
        filePaths.map(async (filePath) => {
          try {
            if (fs.existsSync(filePath)) {
              await fs.promises.unlink(filePath);
            }
          } catch {
            // ignore
          }
        })
      );
    }

    if (filenames?.length) {
      await Promise.all(
        filenames.map((filename) =>
          this.storage.deleteIfExists(
            this.storage.publicPathForFilename(filename, 'our-works')
          )
        )
      );
    }
  }
}

export const ourWorkService = new OurWorkService();
