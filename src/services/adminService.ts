import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AdminRole } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../config';
import {
  hashToken,
  refreshTokenExpiryDate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/adminTokens';
import { AppError } from '../utils/AppError';
import { isValidEmail, optionalTrim } from '../utils/validation';

const ADMIN_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

type AdminSafe = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  createdAt: Date;
  updatedAt: Date;
};

type AdminAuthRecord = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  refreshTokenHash: string | null;
  refreshTokenExpiresAt: Date | null;
};

const ADMIN_AUTH_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  refreshTokenHash: true,
  refreshTokenExpiresAt: true,
} as const;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  admin: {
    id: string;
    name: string;
    email: string;
    role: AdminRole;
  };
}

export class AdminService {
  private async findAdminForAuth(id: string): Promise<AdminAuthRecord | null> {
    return prisma.admin.findUnique({
      where: { id },
      select: ADMIN_AUTH_SELECT,
    }) as Promise<AdminAuthRecord | null>;
  }

  private async issueTokenPair(admin: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = signAccessToken(admin);
    const refreshToken = signRefreshToken(admin);

    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        refreshTokenHash: hashToken(refreshToken),
        refreshTokenExpiresAt: refreshTokenExpiryDate(),
      },
    });

    return { accessToken, refreshToken };
  }

  async login(emailInput: unknown, passwordInput: unknown): Promise<LoginResult> {
    const email = String(emailInput ?? '').trim().toLowerCase();
    const password = String(passwordInput ?? '');

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      throw new AppError('Invalid email or password', 401);
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new AppError('Invalid email or password', 401);
    }

    const tokens = await this.issueTokenPair(admin);

    return {
      ...tokens,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    };
  }

  async refresh(refreshTokenInput: unknown): Promise<LoginResult> {
    const refreshToken = String(refreshTokenInput ?? '').trim();
    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    let payload: { id: string; email: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const admin = await this.findAdminForAuth(payload.id);
    if (!admin || admin.email !== payload.email) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const incomingHash = hashToken(refreshToken);
    if (
      !admin.refreshTokenHash ||
      admin.refreshTokenHash !== incomingHash ||
      !admin.refreshTokenExpiresAt ||
      admin.refreshTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const tokens = await this.issueTokenPair(admin);

    return {
      ...tokens,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    };
  }

  async logout(
    refreshTokenInput: unknown,
    authorizationHeader?: string
  ): Promise<void> {
    const refreshToken = String(refreshTokenInput ?? '').trim();

    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        const admin = await this.findAdminForAuth(payload.id);
        if (admin && admin.refreshTokenHash === hashToken(refreshToken)) {
          await prisma.admin.update({
            where: { id: admin.id },
            data: {
              refreshTokenHash: null,
              refreshTokenExpiresAt: null,
            },
          });
        }
      } catch {
        // Ignore invalid refresh tokens on logout
      }
      return;
    }

    if (authorizationHeader?.startsWith('Bearer ')) {
      const accessToken = authorizationHeader.slice(7);
      try {
        const decoded = jwt.verify(accessToken, config.jwtSecret) as {
          id?: string;
        };
        if (decoded.id) {
          await prisma.admin.update({
            where: { id: decoded.id },
            data: {
              refreshTokenHash: null,
              refreshTokenExpiresAt: null,
            },
          });
        }
      } catch {
        // Ignore invalid access tokens on logout
      }
    }
  }

  async listAdmins(): Promise<AdminSafe[]> {
    return prisma.admin.findMany({
      select: ADMIN_SAFE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAdmin(input: {
    name?: unknown;
    email?: unknown;
    password?: unknown;
  }): Promise<AdminSafe> {
    const name = optionalTrim(input.name);
    const email = String(input.email ?? '').trim().toLowerCase();
    const password = String(input.password ?? '');

    if (!name) {
      throw new AppError('Name is required', 400);
    }

    if (!email || !isValidEmail(email)) {
      throw new AppError('A valid email is required', 400);
    }

    if (!password || password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('An admin with this email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    return prisma.admin.create({
      data: {
        name,
        email,
        passwordHash,
        role: AdminRole.ADMIN,
      },
      select: ADMIN_SAFE_SELECT,
    });
  }

  async updateAdmin(
    id: string,
    input: { name?: unknown; email?: unknown; password?: unknown }
  ): Promise<AdminSafe> {
    const existing = await prisma.admin.findUnique({ where: { id } });

    if (!existing) {
      throw new AppError('Admin not found', 404);
    }

    const name =
      input.name !== undefined ? optionalTrim(input.name) : existing.name;
    const emailRaw =
      input.email !== undefined
        ? String(input.email).trim().toLowerCase()
        : existing.email;
    const password =
      input.password !== undefined ? String(input.password) : '';

    if (!name) {
      throw new AppError('Name cannot be empty', 400);
    }

    if (!emailRaw || !isValidEmail(emailRaw)) {
      throw new AppError('A valid email is required', 400);
    }

    if (password && password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    if (emailRaw !== existing.email) {
      const conflict = await prisma.admin.findUnique({
        where: { email: emailRaw },
      });
      if (conflict) {
        throw new AppError('An admin with this email already exists', 409);
      }
    }

    const data: {
      name: string;
      email: string;
      passwordHash?: string;
    } = {
      name,
      email: emailRaw,
    };

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    return prisma.admin.update({
      where: { id },
      data,
      select: ADMIN_SAFE_SELECT,
    });
  }

  async deleteAdmin(id: string, currentUserId?: string): Promise<void> {
    const existing = await prisma.admin.findUnique({ where: { id } });

    if (!existing) {
      throw new AppError('Admin not found', 404);
    }

    if (currentUserId === id) {
      throw new AppError('You cannot delete your own account', 400);
    }

    if (existing.role === AdminRole.SUPER_ADMIN) {
      const superAdminCount = await prisma.admin.count({
        where: { role: AdminRole.SUPER_ADMIN },
      });
      if (superAdminCount <= 1) {
        throw new AppError('Cannot delete the last super admin', 400);
      }
    }

    await prisma.admin.delete({ where: { id } });
  }
}

export const adminService = new AdminService();
