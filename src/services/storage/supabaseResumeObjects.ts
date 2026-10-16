import path from 'path';
import { config } from '../../config';
import { getSupabaseClient } from '../../config/supabase';
import { AppError } from '../../utils/AppError';
import { isValidResumeObjectPath } from '../../utils/resumePaths';

/**
 * Thin wrapper around the server-side Supabase Storage client for the private
 * `private-resumes` bucket. The secret key never leaves the server and is
 * never included in responses or logs.
 */

export function getResumeBucket(): string {
  return config.supabaseResumeBucket || 'private-resumes';
}

export interface SignedResumeUpload {
  signedUrl: string;
  token: string;
  path: string;
}

export interface ResumeObjectInfo {
  exists: boolean;
  size?: number;
  contentType?: string;
}

function assertValidObjectPath(objectPath: string): void {
  if (!isValidResumeObjectPath(objectPath)) {
    throw new AppError('Invalid resume storage path', 400);
  }
}

/**
 * Create a short-lived signed upload URL/token for an object path the backend
 * generated. The applicant uploads directly to the returned URL; the secret
 * key and signed token are never logged.
 */
export async function createSignedResumeUploadUrl(
  objectPath: string
): Promise<SignedResumeUpload> {
  assertValidObjectPath(objectPath);
  const bucket = getResumeBucket();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (error || !data?.signedUrl || !data?.token) {
    // Never log the signed URL or token.
    console.error('Supabase signed resume upload URL request failed');
    throw new AppError('Failed to create resume upload URL', 500);
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path || objectPath,
  };
}

function splitDirAndName(objectPath: string): { dir: string; name: string } {
  const dir = objectPath.includes('/')
    ? objectPath.slice(0, objectPath.lastIndexOf('/'))
    : '';
  return { dir, name: path.basename(objectPath) };
}

/**
 * Verify that an object exists in the private bucket and, where Storage
 * reports it, that the stored size/content type look sane. Uses list()
 * (read-only) with a short retry so a just-finished upload is not rejected
 * due to eventual consistency.
 */
export async function verifyResumeObject(
  objectPath: string,
  attempts = 3,
  delayMs = 150
): Promise<ResumeObjectInfo> {
  assertValidObjectPath(objectPath);
  const bucket = getResumeBucket();
  const supabase = getSupabaseClient();
  const { dir, name } = splitDirAndName(objectPath);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(dir, {
        search: name,
        limit: 100,
      });
      if (!error) {
        const match = (data || []).find((entry) => entry.name === name);
        if (match) {
          const metadata =
            (match as { metadata?: { size?: number; mimetype?: string } })
              .metadata || {};
          const size =
            typeof metadata.size === 'number' ? metadata.size : undefined;
          const contentType =
            typeof metadata.mimetype === 'string' ? metadata.mimetype : undefined;
          return { exists: true, size, contentType };
        }
      }
    } catch {
      // fall through to retry
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { exists: false };
}

/**
 * Delete a resume object from the private bucket. Invalid paths are ignored
 * so callers can pass legacy/foreign values safely.
 */
export async function deleteResumeObject(
  objectPath: string | null | undefined
): Promise<void> {
  if (!objectPath || !isValidResumeObjectPath(objectPath)) {
    return;
  }

  try {
    const { error } = await getSupabaseClient()
      .storage.from(getResumeBucket())
      .remove([objectPath]);
    if (error) {
      console.error('Supabase resume delete failed:', error.message);
    }
  } catch (error) {
    console.error('Supabase resume delete error:', error);
  }
}
