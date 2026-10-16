import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  AllowedImageMimeType,
  IMAGE_BUCKET_FOLDERS,
  IMAGE_MAX_BYTES,
  IMAGE_MIME_EXTENSIONS,
  ImageFolder,
  MAX_IMAGE_OBJECT_PATH_LENGTH,
} from '../constants/images';

/**
 * Server-side validation for Supabase Storage image object paths.
 *
 * Object paths look like `blogs/<uuid>.jpg` or `our-works/<uuid>.png`.
 * They are never local filesystem paths, never absolute URLs and never
 * allowed to point at another feature's prefix.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isAllowedImageFolder(value: unknown): value is ImageFolder {
  return (
    typeof value === 'string' &&
    (IMAGE_BUCKET_FOLDERS as readonly string[]).includes(value)
  );
}

export function isAllowedImageMimeType(
  value: unknown
): value is AllowedImageMimeType {
  return (
    typeof value === 'string' &&
    (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
  );
}

/** Lower-cased extension including the dot ('' when absent). */
export function extensionOf(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot).toLowerCase();
}

export function isAllowedImageMimeForExtension(
  extension: string,
  mime: AllowedImageMimeType
): boolean {
  return IMAGE_MIME_EXTENSIONS[mime].includes(extension);
}

export function isAbsoluteHttpUrl(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^https?:\/\//i.test(value.trim())
  );
}

export function isLegacyLocalImagePath(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith('/uploads/');
}

/**
 * True when `filename` is a bare filename (no directories, no traversal)
 * with one of the approved image extensions.
 */
export function isSafeImageFilename(filename: unknown): boolean {
  if (typeof filename !== 'string') {
    return false;
  }
  const trimmed = filename.trim();
  if (!trimmed || trimmed.length > 255) {
    return false;
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return false;
  }
  const segments = trimmed.split('.');
  if (segments.length < 2) {
    return false;
  }
  return ALLOWED_IMAGE_EXTENSIONS.includes(extensionOf(trimmed));
}

/**
 * Validate a stored object path against the expected folder prefix.
 * Rejects traversal, absolute/relative filesystem paths, external URLs,
 * unexpected buckets and other features' prefixes.
 */
export function isValidImageObjectPath(
  value: unknown,
  folder: ImageFolder
): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_IMAGE_OBJECT_PATH_LENGTH ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    isAbsoluteHttpUrl(trimmed)
  ) {
    return false;
  }

  const prefix = `${folder}/`;
  if (!trimmed.startsWith(prefix)) {
    return false;
  }

  const rest = trimmed.slice(prefix.length);
  if (!rest) {
    return false;
  }

  const segments = rest.split('/');
  if (segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    return false;
  }

  return ALLOWED_IMAGE_EXTENSIONS.includes(extensionOf(rest));
}

export function getFolderFromObjectPath(
  value: unknown
): ImageFolder | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  for (const folder of IMAGE_BUCKET_FOLDERS) {
    if (trimmed.startsWith(`${folder}/`)) {
      return folder;
    }
  }
  return null;
}

/**
 * Extract the object path from a Supabase public URL that belongs to
 * `bucket`. Returns null for any other URL.
 */
export function objectPathFromSupabasePublicUrl(
  value: unknown,
  bucket: string
): string | null {
  if (!isAbsoluteHttpUrl(value)) {
    return null;
  }
  if (!bucket) {
    return null;
  }
  try {
    const url = new URL(String(value).trim());
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx < 0) {
      return null;
    }
    return decodeURIComponent(url.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

/**
 * Resolve a client-supplied value into a validated object path for `folder`.
 * Accepts a raw object path or a public URL from the configured bucket.
 * Returns null when the value is not acceptable for this folder.
 */
export function resolveImageObjectPath(
  value: unknown,
  folder: ImageFolder,
  bucket = 'user-images'
): string | null {
  if (isValidImageObjectPath(value, folder)) {
    return String(value).trim();
  }

  const fromUrl = objectPathFromSupabasePublicUrl(value, bucket);
  if (fromUrl && isValidImageObjectPath(fromUrl, folder)) {
    return fromUrl;
  }

  return null;
}

export function isWithinSizeLimit(size: number): boolean {
  return Number.isFinite(size) && size > 0 && size <= IMAGE_MAX_BYTES;
}
