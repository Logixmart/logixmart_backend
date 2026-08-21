import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'supersecretjwtkeyforadminpanel',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@logixmart.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'LogixmartAdmin2026!',
};

