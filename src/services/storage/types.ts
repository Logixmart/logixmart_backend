/**
 * Abstract file storage interface.
 * Local disk and Supabase Storage share this contract.
 */
export type UploadFolder = 'blogs' | 'resumes' | 'our-works';

export interface FileStorage {
  getPublicUrl(storedPath: string): string;

  /**
   * Delete a file identified by its stored path
   * (e.g. /uploads/blogs/x.jpg or blogs/x.jpg in Supabase).
   * Missing files are ignored.
   */
  deleteIfExists(storedPath: string | null | undefined): Promise<void>;

  /**
   * Whether the object identified by its stored path currently exists.
   * Read-only; missing/invalid paths return false.
   */
  exists(storedPath: string | null | undefined): Promise<boolean>;

  /**
   * Build the durable storage path for a file under a folder.
   */
  publicPathForFilename(filename: string, folder?: UploadFolder): string;

  /**
   * Persist a Multer temp file into durable storage.
   * Returns the path to store in the database (not a binary).
   * Local storage: file already on disk — returns publicPathForFilename.
   * Supabase: uploads to bucket, removes local temp, returns object path.
   */
  persistLocalUpload(
    localFilePath: string,
    filename: string,
    folder?: UploadFolder
  ): Promise<string>;
}
