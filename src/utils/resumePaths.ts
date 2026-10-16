import {
  ALLOWED_RESUME_MIME_TYPES,
  AllowedResumeMimeType,
  MAX_RESUME_OBJECT_PATH_LENGTH,
  RESUME_BUCKET_FOLDER,
  RESUME_EXTENSIONS,
  RESUME_MAX_BYTES,
  RESUME_MIME_EXTENSIONS,
} from '../constants/resumes';

/**
 * Server-side validation for private resume object paths.
 *
 * Object paths look like `resumes/<uuid>.pdf` and are never local filesystem
 * paths, absolute URLs, or paths belonging to another bucket/feature.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Lower-cased extension including the dot ('' when absent). */
export function extensionOf(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot).toLowerCase();
}

export function isAllowedResumeExtension(
  value: unknown
): value is (typeof RESUME_EXTENSIONS)[number] {
  return (
    typeof value === 'string' &&
    (RESUME_EXTENSIONS as readonly string[]).includes(value)
  );
}

export function isAllowedResumeMimeType(
  value: unknown
): value is AllowedResumeMimeType {
  return (
    typeof value === 'string' &&
    (ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(value)
  );
}

export function isAllowedResumeMimeForExtension(
  extension: string,
  mime: AllowedResumeMimeType
): boolean {
  return RESUME_MIME_EXTENSIONS[mime].includes(extension);
}

export function isAbsoluteHttpUrl(value: unknown): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * True when `filename` is a bare filename (no directories, no traversal)
 * with one of the approved resume extensions.
 */
export function isSafeResumeFilename(filename: unknown): boolean {
  if (typeof filename !== 'string') {
    return false;
  }
  const trimmed = filename.trim();
  if (!trimmed || trimmed.length > 255) {
    return false;
  }
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..')
  ) {
    return false;
  }
  const segments = trimmed.split('.');
  if (segments.length < 2) {
    return false;
  }
  return isAllowedResumeExtension(extensionOf(trimmed));
}

/**
 * Validate a client-supplied resume object path.
 * Rejects traversal, absolute/relative filesystem paths, external URLs,
 * unexpected bucket prefixes and malformed paths.
 */
export function isValidResumeObjectPath(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_RESUME_OBJECT_PATH_LENGTH ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    isAbsoluteHttpUrl(trimmed)
  ) {
    return false;
  }

  const prefix = `${RESUME_BUCKET_FOLDER}/`;
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

  return isAllowedResumeExtension(extensionOf(rest));
}

export function isResumeSizeWithinLimit(size: number): boolean {
  return Number.isFinite(size) && size > 0 && size <= RESUME_MAX_BYTES;
}
