import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import { adminService } from '../services/adminService';

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
    const result = await adminService.login(req.body.email, req.body.password);
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      admin: result.admin,
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
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await adminService.refresh(req.body.refreshToken);
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      admin: result.admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin logout
 * POST /api/admin/logout
 * Optional body: { refreshToken } — clears stored refresh token
 */
export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await adminService.logout(
      req.body.refreshToken,
      req.headers.authorization
    );
    res.status(200).json({
      success: true,
      message:
        'Logged out successfully. Please discard the authentication tokens.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List admins (super admin)
 * GET /api/admin/users
 */
export const listAdmins = async (
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const admins = await adminService.listAdmins();
    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create admin (super admin) — role fixed to ADMIN
 * POST /api/admin/users
 */
export const createAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const admin = await adminService.createAdmin(req.body);
    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update admin (super admin)
 * PUT /api/admin/users/:id
 */
export const updateAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const admin = await adminService.updateAdmin(String(req.params.id), req.body);
    res.status(200).json({
      success: true,
      message: 'Admin updated successfully',
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete admin (super admin)
 * DELETE /api/admin/users/:id
 */
export const deleteAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await adminService.deleteAdmin(String(req.params.id), req.user?.id);
    res.status(200).json({
      success: true,
      message: 'Admin deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
