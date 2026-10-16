import crypto from 'crypto';
import { AppError } from '../utils/AppError';
import {
  extensionOf,
  isAllowedImageFolder,
  isAllowedImageMimeForExtension,
  isAllowedImageMimeType,
  isSafeImageFilename,
  isWithinSizeLimit,
} from '../utils/imagePaths';
import {
  AllowedImageMimeType,
  IMAGE_MIME_CANONICAL_EXTENSION,
  ImageFolder,
} from '../constants/images';
import {
  createSignedImageUploadUrl,
  getImageBucket,
} from './storage/supabaseImageObjects';

export interface CreateUploadUrlInput {
  folder?: unknown;
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
}

export interface ValidatedUploadRequest {
  folder: ImageFolder;
  extension: string;
  contentType: AllowedImageMimeType;
}

export interface CreateUploadUrlResult {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
}

/**
 * Validate the client request, generate the object path on the server
 * (client never chooses the path) and mint a signed upload URL/token.
 */
export class ImageUploadService {
  validate(input: CreateUploadUrlInput): ValidatedUploadRequest {
    const { folder, filename, contentType, size } = input;

    if (folder === undefined || folder === null || folder === '') {
      throw new AppError('A folder is required', 400);
    }

    // Disallowed/unauthorized folder is a forbidden action.
    if (!isAllowedImageFolder(folder)) {
      throw new AppError('Folder is not allowed for image uploads', 403);
    }

    if (contentType === undefined || contentType === null || contentType === '') {
      throw new AppError('A content type is required', 400);
    }

    if (!isAllowedImageMimeType(contentType)) {
      throw new AppError(
        'Only JPEG, PNG and WebP images are allowed',
        400
      );
    }

    if (!isSafeImageFilename(filename)) {
      throw new AppError('A valid image filename is required', 400);
    }

    const extension = extensionOf(String(filename).trim());
    if (!isAllowedImageMimeForExtension(extension, contentType)) {
      throw new AppError(
        'Filename extension does not match the declared content type',
        400
      );
    }

    if (size === undefined || size === null || size === '') {
      throw new AppError('File size is required', 400);
    }

    const numericSize = Number(size);
    if (!Number.isFinite(numericSize) || numericSize <= 0) {
      throw new AppError('File size is invalid', 400);
    }

    if (!isWithinSizeLimit(numericSize)) {
      throw new AppError('Image must be 5MB or smaller', 413);
    }

    return { folder, extension, contentType };
  }

  async createUploadUrl(
    input: CreateUploadUrlInput
  ): Promise<CreateUploadUrlResult> {
    const { folder, contentType } = this.validate(input);

    // Server-generated path — never trust a client-provided path.
    const extension = IMAGE_MIME_CANONICAL_EXTENSION[contentType];
    const objectPath = `${folder}/${crypto.randomUUID()}${extension}`;

    const signed = await createSignedImageUploadUrl(objectPath);

    return {
      bucket: getImageBucket(),
      path: signed.path,
      token: signed.token,
      signedUrl: signed.signedUrl,
    };
  }
}

export const imageUploadService = new ImageUploadService();
