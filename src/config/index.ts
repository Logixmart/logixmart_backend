import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const uploadsRoot = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR || 'uploads'
);

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'supersecretjwtkeyforadminpanel',
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_SECRET ||
    'supersecretjwtkeyforadminpanel',
  /** Access token lifetime (e.g. 15m, 1h) */
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
  /** Refresh token lifetime (e.g. 7d, 30d) */
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@logixmart.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'LogixmartAdmin2026!',
  databaseUrl: process.env.DATABASE_URL || '',
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
  uploadsRoot,
  blogsUploadDir: path.join(uploadsRoot, 'blogs'),
  resumesUploadDir: path.join(uploadsRoot, 'resumes'),
};
