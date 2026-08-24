import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

const IMAGE_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const RESUME_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);
const RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB

function uniqueFilename(originalName: string, allowedExts: Set<string>): string {
  const ext = path.extname(originalName).toLowerCase();
  const safeExt = allowedExts.has(ext) ? ext : '';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(config.blogsUploadDir);
    cb(null, config.blogsUploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, uniqueFilename(file.originalname, IMAGE_EXTENSIONS));
  },
});

const imageFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const extOk = IMAGE_EXTENSIONS.has(ext);
  const mimeOk = IMAGE_MIME_TYPES.has(file.mimetype.toLowerCase());

  if (extOk && mimeOk) {
    cb(null, true);
    return;
  }

  cb(new Error('Only images (jpeg, jpg, png, webp) are allowed'));
};

export const upload = multer({
  storage: imageStorage,
  limits: { fileSize: FILE_SIZE_LIMIT },
  fileFilter: imageFilter,
});

const resumeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(config.resumesUploadDir);
    cb(null, config.resumesUploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, uniqueFilename(file.originalname, RESUME_EXTENSIONS));
  },
});

const resumeFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const extOk = RESUME_EXTENSIONS.has(ext);
  const mimeOk = RESUME_MIME_TYPES.has(file.mimetype.toLowerCase());

  if (extOk && mimeOk) {
    cb(null, true);
    return;
  }

  cb(new Error('Only resume files (pdf, doc, docx) are allowed'));
};

export const resumeUpload = multer({
  storage: resumeStorage,
  limits: { fileSize: FILE_SIZE_LIMIT },
  fileFilter: resumeFilter,
});
