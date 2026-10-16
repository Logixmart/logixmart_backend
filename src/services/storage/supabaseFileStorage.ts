import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import {
  getSupabaseClient,
  SUPABASE_IMAGE_BUCKET,
} from '../../config/supabase';
import { AppError } from '../../utils/AppError';
import { FileStorage, UploadFolder } from './types';
import { imageObjectExists } from './supabaseImageObjects';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Public image storage for blogs / our-works via Supabase bucket `user-images`.
 * Resumes stay on LocalFileStorage (private).
 *
 * DB stores object paths like `blogs/123.png` (never binary).
 * Legacy `/uploads/...` paths still resolve for getPublicUrl via API_BASE_URL.
 */
export class SupabaseFileStorage implements FileStorage {
  private readonly bucket: string;

  constructor(bucket: string = config.supabaseImageBucket || SUPABASE_IMAGE_BUCKET) {
    this.bucket = bucket;
  }

  publicPathForFilename(
    filename: string,
    folder: UploadFolder = 'blogs'
  ): string {
    if (folder === 'resumes') {
      throw new AppError(
        'Resumes must not be stored in the public Supabase image bucket',
        500
      );
    }
    const safeName = path.basename(filename);
    return `${folder}/${safeName}`;
  }

  getPublicUrl(storedPath: string): string {
    if (!storedPath) {
      return '';
    }
    if (storedPath.startsWith('http://') || storedPath.startsWith('https://')) {
      return storedPath;
    }

    // Legacy local paths still served by Express static
    if (storedPath.startsWith('/uploads/')) {
      const base = config.apiBaseUrl.replace(/\/$/, '');
      return `${base}${storedPath}`;
    }

    const objectPath = this.normalizeObjectPath(storedPath);
    if (!objectPath) {
      return '';
    }

    const { data } = getSupabaseClient()
      .storage.from(this.bucket)
      .getPublicUrl(objectPath);

    return data.publicUrl;
  }

  async persistLocalUpload(
    localFilePath: string,
    filename: string,
    folder: UploadFolder = 'blogs'
  ): Promise<string> {
    if (folder === 'resumes') {
      throw new AppError(
        'Resumes must not be stored in the public Supabase image bucket',
        500
      );
    }

    const objectPath = this.publicPathForFilename(filename, folder);
    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    let buffer: Buffer;
    try {
      buffer = await fs.promises.readFile(localFilePath);
    } catch {
      throw new AppError('Uploaded image file could not be read', 400);
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(objectPath, buffer, {
        contentType,
        upsert: false,
      });

    // Always remove Multer temp file after upload attempt
    await this.unlinkQuietly(localFilePath);

    if (error) {
      console.error('Supabase image upload failed:', error.message);
      throw new AppError('Failed to upload image to storage', 500);
    }

    return objectPath;
  }

  async deleteIfExists(storedPath: string | null | undefined): Promise<void> {
    if (!storedPath) {
      return;
    }

    // Leave legacy local files alone if still referenced
    if (
      storedPath.startsWith('/uploads/') ||
      storedPath.startsWith('http://') ||
      storedPath.startsWith('https://')
    ) {
      const objectPath = this.objectPathFromUrlOrLegacy(storedPath);
      if (!objectPath) {
        return;
      }
      await this.removeObject(objectPath);
      return;
    }

    const objectPath = this.normalizeObjectPath(storedPath);
    if (!objectPath) {
      return;
    }
    await this.removeObject(objectPath);
  }

  async exists(storedPath: string | null | undefined): Promise<boolean> {
    if (!storedPath) {
      return false;
    }

    // Legacy /uploads/... files live on disk, not in this bucket.
    if (storedPath.startsWith('/uploads/')) {
      return false;
    }

    const objectPath = this.normalizeObjectPath(storedPath);
    if (!objectPath) {
      return false;
    }

    return imageObjectExists(objectPath);
  }

  private async removeObject(objectPath: string): Promise<void> {
    try {
      const { error } = await getSupabaseClient()
        .storage.from(this.bucket)
        .remove([objectPath]);
      if (error) {
        console.error('Supabase image delete failed:', error.message);
      }
    } catch (error) {
      console.error('Supabase image delete error:', error);
    }
  }

  private normalizeObjectPath(storedPath: string): string | null {
    const normalized = storedPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!normalized || normalized.includes('..')) {
      return null;
    }
    if (
      !normalized.startsWith('blogs/') &&
      !normalized.startsWith('our-works/')
    ) {
      return null;
    }
    return normalized;
  }

  private objectPathFromUrlOrLegacy(storedPath: string): string | null {
    try {
      if (storedPath.startsWith('http://') || storedPath.startsWith('https://')) {
        const url = new URL(storedPath);
        const marker = `/storage/v1/object/public/${this.bucket}/`;
        const idx = url.pathname.indexOf(marker);
        if (idx >= 0) {
          return this.normalizeObjectPath(
            decodeURIComponent(url.pathname.slice(idx + marker.length))
          );
        }
        return null;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async unlinkQuietly(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // ignore
    }
  }
}
