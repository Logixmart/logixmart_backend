/**
 * Abstract file storage interface.
 * Swap LocalFileStorage for an S3 implementation later without changing business logic.
 */
export interface FileStorage {
  getPublicUrl(storedPath: string): string;

  /**
   * Delete a file identified by its public/relative path (e.g. /uploads/blogs/x.jpg).
   * Missing files are ignored. Path traversal and paths outside allowed roots are rejected.
   */
  deleteIfExists(storedPath: string | null | undefined): Promise<void>;

  /**
   * Build the public relative path for a file under uploads/<folder>/.
   */
  publicPathForFilename(filename: string, folder?: 'blogs' | 'resumes'): string;
}
