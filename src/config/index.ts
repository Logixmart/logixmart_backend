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

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

const mailPort = Number(process.env.SMTP_PORT) || 587;

// Preserve the production startup guard for the database URL. The value
// itself is consumed by Prisma (via .env), so it is not stored on `config`.
requireEnv('DATABASE_URL', isProduction ? undefined : '');

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
  adminPassword:
    process.env.ADMIN_PASSWORD ||
    (isProduction ? '' : 'Password@123'),
  apiBaseUrl:
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}`,
  corsOrigins,
  uploadsRoot,
  blogsUploadDir: path.join(uploadsRoot, 'blogs'),
  resumesUploadDir: path.join(uploadsRoot, 'resumes'),
  ourWorksUploadDir: path.join(uploadsRoot, 'our-works'),
  /**
   * Supabase Storage (images). Kept separate from DATABASE_URL / Prisma.
   * Secret key must never be logged or returned in API responses.
   */
  supabaseUrl: process.env.SUPABASE_URL?.trim() || '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() || '',
  supabaseImageBucket: process.env.SUPABASE_IMAGE_BUCKET?.trim() || 'user-images',
  /** Private resumes only — never public. Separate from image bucket. */
  supabaseResumeBucket:
    process.env.SUPABASE_RESUME_BUCKET?.trim() || 'private-resumes',
  /**
   * Outbound email (SMTP). Provider is not yet confirmed — all connection
   * settings are configurable and never defaulted to a guessed provider.
   * Credentials (`SMTP_PASS`) must never be logged or committed.
   */
  mail: {
    host: process.env.SMTP_HOST?.trim() || '',
    port: mailPort,
    secure: parseBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER?.trim() || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM?.trim() || '',
    /** Job application notifications. */
    hrNotificationEmail: process.env.HR_NOTIFICATION_EMAIL?.trim() || '',
    /** Client query/contact notifications. */
    clientQueryEmail: process.env.CLIENT_QUERY_EMAIL?.trim() || '',
    /** Optional admin panel base URL used to link an application in emails. */
    adminAppUrl: process.env.ADMIN_APP_URL?.trim() || '',
  },
};

if (isProduction && !config.adminPassword) {
  throw new Error('Missing required environment variable: ADMIN_PASSWORD');
}

/** True when both Supabase Storage env vars are present (values never logged). */
export function hasSupabaseStorageConfig(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseSecretKey);
}

/**
 * True when the minimum SMTP settings needed to send mail are present.
 * Recipients are validated per notification type.
 */
export function isMailConfigured(): boolean {
  return Boolean(config.mail.host && config.mail.from);
}

/**
 * Names of missing SMTP variables. Returns names only — never values — so it
 * is safe to log or print.
 */
export function getMissingMailVars(): string[] {
  const missing: string[] = [];
  if (!config.mail.host) missing.push('SMTP_HOST');
  if (!config.mail.from) missing.push('MAIL_FROM');
  if (!config.mail.hrNotificationEmail) missing.push('HR_NOTIFICATION_EMAIL');
  if (!config.mail.clientQueryEmail) missing.push('CLIENT_QUERY_EMAIL');
  return missing;
}

/**
 * Log the email configuration status at startup. Missing configuration is
 * non-fatal: the API keeps working and notifications are skipped with a
 * warning. Never logs credentials.
 */
export function validateMailConfig(): void {
  if (isMailConfigured()) {
    console.log(
      `[mail] SMTP enabled (host=${config.mail.host}, port=${config.mail.port}, secure=${config.mail.secure})`
    );
    const missing = getMissingMailVars();
    if (missing.length) {
      console.warn(
        `[mail] Some recipients are not configured; related notifications will be skipped: ${missing.join(', ')}`
      );
    }
    return;
  }

  console.warn(
    `[mail] SMTP disabled — set ${getMissingMailVars().join(', ')} to enable email notifications.`
  );
}
