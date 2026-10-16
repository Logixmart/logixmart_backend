/**
 * Shared resume upload constraints for direct-to-Supabase uploads.
 * The server is always the source of truth — keep the frontend in sync.
 */

/** Prefix for every resume object path inside the private bucket. */
export const RESUME_BUCKET_FOLDER = 'resumes';

export const RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const;
export type ResumeExtension = (typeof RESUME_EXTENSIONS)[number];

export const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export type AllowedResumeMimeType = (typeof ALLOWED_RESUME_MIME_TYPES)[number];

/** Maximum accepted resume size (mirrors Multer's 5 MB limit). */
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

/** Defensive cap on object path length. */
export const MAX_RESUME_OBJECT_PATH_LENGTH = 512;

/** Extensions accepted for each declared MIME type. */
export const RESUME_MIME_EXTENSIONS: Record<AllowedResumeMimeType, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
};
