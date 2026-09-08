import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AdminRole } from '@prisma/client';
import { config } from '../config';
import type { AdminJwtRole } from '../middlewares/auth';

export interface AdminTokenPayload {
  id: string;
  email: string;
  name: string;
  role: AdminJwtRole;
}

interface RefreshTokenPayload {
  id: string;
  email: string;
  tokenType: 'refresh';
}

function parseDurationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/i.exec(value.trim());
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * (multipliers[unit] || multipliers.d);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(admin: {
  id: string;
  email: string;
  name: string;
  role: AdminRole | AdminJwtRole;
}): string {
  const payload: AdminTokenPayload = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role as AdminJwtRole,
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtAccessExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(admin: {
  id: string;
  email: string;
}): string {
  const payload: RefreshTokenPayload = {
    id: admin.id,
    email: admin.email,
    tokenType: 'refresh',
  };
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenPayload;
  if (!decoded?.id || !decoded?.email || decoded.tokenType !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return decoded;
}

export function refreshTokenExpiryDate(): Date {
  return new Date(Date.now() + parseDurationToMs(config.jwtRefreshExpiresIn));
}
