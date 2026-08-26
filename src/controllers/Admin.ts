import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AdminRole } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../config';
import { AuthenticatedRequest } from '../middlewares/auth';
import {
  hashToken,
  refreshTokenExpiryDate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/adminTokens';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

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

function optionalTrim(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

async function findAdminForAuth(
  id: string
): Promise<AdminAuthRecord | null> {
  return prisma.admin.findUnique({
    where: { id },
    select: ADMIN_AUTH_SELECT,
  }) as Promise<AdminAuthRecord | null>;
}

async function issueTokenPair(admin: {
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

/**
 * Admin login
 * POST /api/admin/login
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password ?? '');

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
      return;
    }

    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    const { accessToken, refreshToken } = await issueTokenPair(admin);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token
 * POST /api/admin/refresh
 * Body: { refreshToken }
 */
export const refresh = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const refreshToken = String(req.body.refreshToken ?? '').trim();
    if (!refreshToken) {
      res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
      return;
    }

    let payload: { id: string; email: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    const admin = await findAdminForAuth(payload.id);
    if (!admin || admin.email !== payload.email) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    const incomingHash = hashToken(refreshToken);
    if (
      !admin.refreshTokenHash ||
      admin.refreshTokenHash !== incomingHash ||
      !admin.refreshTokenExpiresAt ||
      admin.refreshTokenExpiresAt.getTime() < Date.now()
    ) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    const tokens = await issueTokenPair(admin);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Refresh Token Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
    });
  }
};

/**
 * Admin logout
 * POST /api/admin/logout
 * Optional body: { refreshToken } — clears stored refresh token
 */
export const logout = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const refreshToken = String(req.body.refreshToken ?? '').trim();

    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        const admin = await findAdminForAuth(payload.id);
        if (
          admin &&
          admin.refreshTokenHash === hashToken(refreshToken)
        ) {
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
    } else if (req.headers.authorization?.startsWith('Bearer ')) {
      const accessToken = req.headers.authorization.slice(7);
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

    res.status(200).json({
      success: true,
      message: 'Logged out successfully. Please discard the authentication tokens.',
    });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout',
    });
  }
};

/**
 * List admins (super admin)
 * GET /api/admin/users
 */
export const listAdmins = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const admins = await prisma.admin.findMany({
      select: ADMIN_SAFE_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    console.error('List Admins Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admins',
    });
  }
};

/**
 * Create admin (super admin) — role fixed to ADMIN
 * POST /api/admin/users
 */
export const createAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const name = optionalTrim(req.body.name);
    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password ?? '');

    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Name is required',
      });
      return;
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      res.status(400).json({
        success: false,
        message: 'A valid email is required',
      });
      return;
    }

    if (!password || password.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
      return;
    }

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'An admin with this email already exists',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.admin.create({
      data: {
        name,
        email,
        passwordHash,
        role: AdminRole.ADMIN,
      },
      select: ADMIN_SAFE_SELECT,
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: admin,
    });
  } catch (error) {
    console.error('Create Admin Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admin',
    });
  }
};

/**
 * Update admin (super admin)
 * PUT /api/admin/users/:id
 */
export const updateAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.admin.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
      return;
    }

    const name =
      req.body.name !== undefined ? optionalTrim(req.body.name) : existing.name;
    const emailRaw =
      req.body.email !== undefined
        ? String(req.body.email).trim().toLowerCase()
        : existing.email;
    const password =
      req.body.password !== undefined ? String(req.body.password) : '';

    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Name cannot be empty',
      });
      return;
    }

    if (!emailRaw || !EMAIL_REGEX.test(emailRaw)) {
      res.status(400).json({
        success: false,
        message: 'A valid email is required',
      });
      return;
    }

    if (password && password.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
      return;
    }

    if (emailRaw !== existing.email) {
      const conflict = await prisma.admin.findUnique({
        where: { email: emailRaw },
      });
      if (conflict) {
        res.status(409).json({
          success: false,
          message: 'An admin with this email already exists',
        });
        return;
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

    const admin = await prisma.admin.update({
      where: { id },
      data,
      select: ADMIN_SAFE_SELECT,
    });

    res.status(200).json({
      success: true,
      message: 'Admin updated successfully',
      data: admin,
    });
  } catch (error) {
    console.error('Update Admin Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update admin',
    });
  }
};

/**
 * Delete admin (super admin)
 * DELETE /api/admin/users/:id
 */
export const deleteAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.admin.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
      return;
    }

    if (req.user?.id === id) {
      res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
      return;
    }

    if (existing.role === AdminRole.SUPER_ADMIN) {
      const superAdminCount = await prisma.admin.count({
        where: { role: AdminRole.SUPER_ADMIN },
      });
      if (superAdminCount <= 1) {
        res.status(400).json({
          success: false,
          message: 'Cannot delete the last super admin',
        });
        return;
      }
    }

    await prisma.admin.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: 'Admin deleted successfully',
    });
  } catch (error) {
    console.error('Delete Admin Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete admin',
    });
  }
};
