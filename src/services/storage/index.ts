import { hasSupabaseStorageConfig } from '../../config';
import { LocalFileStorage } from './localFileStorage';
import { SupabaseFileStorage } from './supabaseFileStorage';
import { SupabaseResumeStorage } from './supabaseResumeStorage';
import { FileStorage } from './types';

export type { FileStorage } from './types';
export { SupabaseResumeStorage } from './supabaseResumeStorage';

/**
 * Private files (resumes).
 * Supabase private bucket when configured; otherwise local disk.
 * Never uses the public user-images bucket.
 */
export const fileStorage: FileStorage = hasSupabaseStorageConfig()
  ? new SupabaseResumeStorage()
  : new LocalFileStorage();

/**
 * Public images (blogs, our-works).
 * Uses Supabase Storage when SUPABASE_URL + SUPABASE_SECRET_KEY are set;
 * otherwise falls back to local disk.
 */
export const imageStorage: FileStorage = hasSupabaseStorageConfig()
  ? new SupabaseFileStorage()
  : new LocalFileStorage();
