import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AdminRole } from '@prisma/client';
import { config } from '../config';

export type AdminJwtRole = 'SUPER_ADMIN' | 'ADMIN';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  name: string;
  role: AdminJwtRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedAdmin;
}

const ALLOWED_ROLES: AdminJwtRole[] = ['SUPER_ADMIN', 'ADMIN'];

function isAdminRole(role: unknown): role is AdminJwtRole {
  return typeof role === 'string' && ALLOWED_ROLES.includes(role as AdminJwtRole);
}

export const authenticateAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access token is required',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret) as Partial<AuthenticatedAdmin>;

    if (
      !decoded.id ||
      !decoded.email ||
      !decoded.name ||
      !isAdminRole(decoded.role)
    ) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
      return;
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

export const requireSuperAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== AdminRole.SUPER_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Access denied: Super admin only',
    });
    return;
  }
  next();
};
