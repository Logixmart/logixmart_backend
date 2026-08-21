import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const router = Router();

// POST /api/admin/login
router.post('/login', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { email, password } = req.body;

    // 1. Validation
    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
      return;
    }

    // 2. Authentication check
    if (email !== config.adminEmail || password !== config.adminPassword) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    // 3. Generate JWT Token
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
});

// POST /api/admin/logout
router.post('/logout', (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please discard the authentication token.',
  });
});

export default router;
