import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import { getSupabaseClient } from '../../config/supabase';
import { AppError } from '../../utils/AppError';
import { FileStorage, UploadFolder } from './types';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Private resume storage in Supabase bucket `private-resumes`.
 * Never uses public URLs — downloads go through authenticated API
 * (service role download or short-lived signed URL on the server).
 */
export class SupabaseResumeStorage implements FileStorage {
  private readonly bucket: string;

  constructor(bucket: string = config.supabaseResumeBucket) {
    this.bucket = bucket;
  }

  publicPathForFilename(
    filename: string,
    folder: UploadFolder = 'resumes'
  ): string {
    if (folder !== 'resumes') {
      throw new AppError(
        'SupabaseResumeStorage only supports the resumes folder',
        500
      );
    }
    return `resumes/${path.basename(filename)}`;
  }

  /**
   * Resumes are not publicly addressable. Callers should use the
   * authenticated download endpoint; this returns empty intentionally.
   */
  getPublicUrl(_storedPath: string): string {
    return '';
  }

  async persistLocalUpload(
    localFilePath: string,
    filename: string,
    folder: UploadFolder = 'resumes'
  ): Promise<string> {
    if (folder !== 'resumes') {
      throw new AppError(
        'SupabaseResumeStorage only supports the resumes folder',
        500
      );
    }

    const objectPath = this.publicPathForFilename(filename, 'resumes');
    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    let buffer: Buffer;
    try {
      buffer = await fs.promises.readFile(localFilePath);
    } catch {
      throw new AppError('Uploaded resume file could not be read', 400);
    }

    const { error } = await getSupabaseClient()
      .storage.from(this.bucket)
      .upload(objectPath, buffer, {
        contentType,
        upsert: false,
      });

    await this.unlinkQuietly(localFilePath);

    if (error) {
      // Duplicate object: treat as success if already present (idempotent apply)
      if (/already exists|Duplicate/i.test(error.message)) {
        return objectPath;
      }
      console.error('Supabase resume upload failed:', error.message);
      throw new AppError('Failed to upload resume to storage', 500);
    }

    return objectPath;
  }

  async deleteIfExists(storedPath: string | null | undefined): Promise<void> {
    if (!storedPath) {
      return;
    }

    const objectPath = this.normalizeObjectPath(storedPath);
    if (!objectPath) {
      // Legacy local path — remove from disk if still present
      if (storedPath.startsWith('/uploads/resumes/')) {
        const local = path.join(
          config.resumesUploadDir,
          path.basename(storedPath)
        );
        await this.unlinkQuietly(local);
      }
      return;
    }

    try {
      const { error } = await getSupabaseClient()
        .storage.from(this.bucket)
        .remove([objectPath]);
      if (error) {
        console.error('Supabase resume delete failed:', error.message);
      }
    } catch (error) {
      console.error('Supabase resume delete error:', error);
    }
  }

  async exists(storedPath: string | null | undefined): Promise<boolean> {
    if (!storedPath) {
      return false;
    }

    const objectPath = this.normalizeObjectPath(storedPath);
    if (!objectPath) {
      if (storedPath.startsWith('/uploads/resumes/')) {
        return fs.existsSync(
          path.join(config.resumesUploadDir, path.basename(storedPath))
        );
      }
      return false;
    }

    const dir = objectPath.includes('/')
      ? objectPath.slice(0, objectPath.lastIndexOf('/'))
      : '';
    const name = path.basename(objectPath);

    try {
      const { data, error } = await getSupabaseClient()
        .storage.from(this.bucket)
        .list(dir, { search: name, limit: 100 });
      if (error) {
        return false;
      }
      return (data || []).some((entry) => entry.name === name);
    } catch {
      return false;
    }
  }

  /**
   * Download resume bytes via service role (admin endpoint only).
   */
  async download(storedPath: string): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    const objectPath = this.normalizeObjectPath(storedPath);
    if (!objectPath) {
      throw new AppError('Invalid resume storage path', 400);
    }

    const { data, error } = await getSupabaseClient()
      .storage.from(this.bucket)
      .download(objectPath);

    if (error || !data) {
      throw new AppError('Resume file not found', 404);
    }

    const arrayBuffer = await data.arrayBuffer();
    const filename = path.basename(objectPath);
    const ext = path.extname(filename).toLowerCase();

    return {
      buffer: Buffer.from(arrayBuffer),
      filename,
      contentType: CONTENT_TYPES[ext] || 'application/octet-stream',
    };
  }

  /**
   * Optional short-lived signed URL (server-side use only; do not expose
   * the service key). Default TTL 60 seconds.
   */
  async createSignedDownloadUrl(
    storedPath: string,
    expiresInSeconds = 60
  ): Promise<string> {
    const objectPath = this.normalizeObjectPath(storedPath);
    if (!objectPath) {
      throw new AppError('Invalid resume storage path', 400);
    }

    const { data, error } = await getSupabaseClient()
      .storage.from(this.bucket)
      .createSignedUrl(objectPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new AppError('Could not create resume download URL', 500);
    }

    return data.signedUrl;
  }

  private normalizeObjectPath(storedPath: string): string | null {
    const normalized = storedPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!normalized || normalized.includes('..')) {
      return null;
    }
    if (!normalized.startsWith('resumes/')) {
      return null;
    }
    return normalized;
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
