import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import { FileStorage } from './types';

const BLOGS_PUBLIC_PREFIX = '/uploads/blogs/';
const RESUMES_PUBLIC_PREFIX = '/uploads/resumes/';
const OUR_WORKS_PUBLIC_PREFIX = '/uploads/our-works/';
const LEGACY_PUBLIC_PREFIX = '/uploads/';

type UploadFolder = 'blogs' | 'resumes' | 'our-works';

const FOLDER_PREFIX: Record<UploadFolder, string> = {
  blogs: BLOGS_PUBLIC_PREFIX,
  resumes: RESUMES_PUBLIC_PREFIX,
  'our-works': OUR_WORKS_PUBLIC_PREFIX,
};

export class LocalFileStorage implements FileStorage {
  private readonly uploadsRoot: string;

  constructor(uploadsRoot: string = config.uploadsRoot) {
    this.uploadsRoot = path.resolve(uploadsRoot);
  }

  getPublicUrl(storedPath: string): string {
    if (!storedPath) {
      return '';
    }
    if (storedPath.startsWith('http://') || storedPath.startsWith('https://')) {
      return storedPath;
    }
    const relative = storedPath.startsWith('/') ? storedPath : `/${storedPath}`;
    const base = config.apiBaseUrl.replace(/\/$/, '');
    return `${base}${relative}`;
  }

  publicPathForFilename(
    filename: string,
    folder: UploadFolder = 'blogs'
  ): string {
    const safeName = path.basename(filename);
    return `${FOLDER_PREFIX[folder]}${safeName}`;
  }

  async deleteIfExists(storedPath: string | null | undefined): Promise<void> {
    if (!storedPath) {
      return;
    }

    const absolutePath = this.resolveSafePath(storedPath);
    if (!absolutePath) {
      return;
    }

    try {
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch (error) {
      console.error('Failed to delete stored file:', absolutePath, error);
    }
  }

  private resolveSafePath(storedPath: string): string | null {
    const normalized = storedPath.replace(/\\/g, '/').trim();

    if (
      !normalized.startsWith(BLOGS_PUBLIC_PREFIX) &&
      !normalized.startsWith(RESUMES_PUBLIC_PREFIX) &&
      !normalized.startsWith(OUR_WORKS_PUBLIC_PREFIX) &&
      !this.isLegacyUploadPath(normalized)
    ) {
      return null;
    }

    if (normalized.includes('..')) {
      return null;
    }

    const underUploads = path.resolve(
      this.uploadsRoot,
      normalized.slice(LEGACY_PUBLIC_PREFIX.length)
    );

    if (
      underUploads !== this.uploadsRoot &&
      !underUploads.startsWith(this.uploadsRoot + path.sep)
    ) {
      return null;
    }

    return underUploads;
  }

  private isLegacyUploadPath(normalized: string): boolean {
    if (!normalized.startsWith(LEGACY_PUBLIC_PREFIX)) {
      return false;
    }
    if (
      normalized.startsWith(BLOGS_PUBLIC_PREFIX) ||
      normalized.startsWith(RESUMES_PUBLIC_PREFIX) ||
      normalized.startsWith(OUR_WORKS_PUBLIC_PREFIX)
    ) {
      return false;
    }
    const rest = normalized.slice(LEGACY_PUBLIC_PREFIX.length);
    return Boolean(rest) && !rest.includes('/');
  }
}
