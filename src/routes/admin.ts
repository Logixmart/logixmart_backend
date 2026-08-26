import { Router } from 'express';
import {
  login,
  logout,
  refresh,
  listAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from '../controllers/Admin';
import {
  authenticateAdmin,
  requireSuperAdmin,
} from '../middlewares/auth';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

router.get('/users', authenticateAdmin, requireSuperAdmin, listAdmins);
router.post('/users', authenticateAdmin, requireSuperAdmin, createAdmin);
router.put('/users/:id', authenticateAdmin, requireSuperAdmin, updateAdmin);
router.delete('/users/:id', authenticateAdmin, requireSuperAdmin, deleteAdmin);

export default router;
