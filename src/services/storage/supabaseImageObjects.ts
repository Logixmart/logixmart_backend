import path from 'path';
import { config } from '../../config';
import { getSupabaseClient } from '../../config/supabase';
import { AppError } from '../../utils/AppError';

/**
 * Thin wrapper around the server-side Supabase Storage client for the public
 * `user-images` bucket. The secret key never leaves the server and is never
 * included in responses or logs.
 */

export function getImageBucket(): string {
  return config.supabaseImageBucket || 'user-images';
}

export interface SignedImageUpload {
  signedUrl: string;
  token: string;
  path: string;
}

/**
 * Create a short-lived signed upload URL/token for an object path that the
 * backend generated. The client uploads directly to the returned URL.
 */
export async function createSignedImageUploadUrl(
  objectPath: string
): Promise<SignedImageUpload> {
  const bucket = getImageBucket();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (error || !data?.signedUrl || !data?.token) {
    // Never log the signed URL or token.
    console.error('Supabase signed upload URL request failed');
    throw new AppError('Failed to create image upload URL', 500);
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path || objectPath,
  };
}

/**
 * Read-only existence check for an object in the image bucket.
 * Uses list() (no writes) and tolerates transient misses with a short retry
 * so an upload that has just finished is not rejected due to eventual
 * consistency.
 */
export async function imageObjectExists(
  objectPath: string,
  attempts = 3,
  delayMs = 150
): Promise<boolean> {
  const bucket = getImageBucket();
  const dir = objectPath.includes('/')
    ? objectPath.slice(0, objectPath.lastIndexOf('/'))
    : '';
  const name = path.basename(objectPath);
  const supabase = getSupabaseClient();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(dir, {
        search: name,
        limit: 100,
      });
      if (!error && (data || []).some((entry) => entry.name === name)) {
        return true;
      }
    } catch {
      // fall through to retry
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

