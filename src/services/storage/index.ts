import { FileStorage } from './types';
import { LocalFileStorage } from './localFileStorage';

export type { FileStorage } from './types';
export { LocalFileStorage } from './localFileStorage';

/** Default storage backend. Replace this export when adding S3. */
export const fileStorage: FileStorage = new LocalFileStorage();
