/**
 * Shared image upload constraints for supers, direct-to-Supabase uploads.
 * Keep in sync with the frontend's client-side validation — the server is
 * always the source of truth.
 */

export const IMAGE_BUCKET_FOLDERS = ['blogs', 'our-works'] as const;
export type ImageFolder = (typeof IMAGE_BUCKET_FOLDERS)[number];

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Server-side maximum for a single image (mirrors Multer's 5 MB limit). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Maximum images allowed on a single Our Works record. */
export const MAX_OUR_WORK_IMAGES = 5;

/** Defensive cap on object path length. */
export const MAX_IMAGE_OBJECT_PATH_LENGTH = 512;

/** Canonical extension used when generating a new object path per MIME type. */
export const IMAGE_MIME_CANONICAL_EXTENSION: Record<AllowedImageMimeType, string> =
  {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };

/** Extensions accepted for each declared MIME type. */
export const IMAGE_MIME_EXTENSIONS: Record<AllowedImageMimeType, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
