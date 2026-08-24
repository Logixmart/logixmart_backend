import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * Admin login
 * POST /api/admin/login
 */
export const login = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
      return;
    }

    if (email !== config.adminEmail || password !== config.adminPassword) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    const token = jwt.sign(
      {
        email: config.adminEmail,
        role: 'admin',
      },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        email: config.adminEmail,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin logout
 * POST /api/admin/logout
 */
export const logout = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please discard the authentication token.',
  });
};
