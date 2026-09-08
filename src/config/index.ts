import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value && isProduction) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || '';
}

const uploadsRoot = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR || 'uploads'
);

const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv,
  isProduction,
  jwtSecret: requireEnv(
    'JWT_SECRET',
    isProduction ? undefined : 'supersecretjwtkeyforadminpanel'
  ),
  jwtRefreshSecret: requireEnv(
    'JWT_REFRESH_SECRET',
    process.env.JWT_SECRET ||
      (isProduction ? undefined : 'supersecretjwtkeyforadminpanel')
  ),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@logixmart.com',
  adminPassword:
    process.env.ADMIN_PASSWORD ||
    (isProduction ? '' : 'LogixmartAdmin2026!'),
  databaseUrl: requireEnv('DATABASE_URL', isProduction ? undefined : ''),
  apiBaseUrl:
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}`,
  corsOrigins,
  /** Debounced JSON snapshots (dev/seed). Disable in production with BACKUP_JSON=false */
  enableJsonBackup:
    process.env.BACKUP_JSON !== 'false' && !isProduction,
  jsonBackupDebounceMs: Number(process.env.BACKUP_JSON_DEBOUNCE_MS) || 5000,
  uploadsRoot,
  blogsUploadDir: path.join(uploadsRoot, 'blogs'),
  resumesUploadDir: path.join(uploadsRoot, 'resumes'),
  ourWorksUploadDir: path.join(uploadsRoot, 'our-works'),
};

if (isProduction && !config.adminPassword) {
  throw new Error('Missing required environment variable: ADMIN_PASSWORD');
}
