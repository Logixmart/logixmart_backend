import { Router } from 'express';
import {
  authenticateAdmin,
  requireSuperAdmin,
} from '../middlewares/auth';
import { contactLimiter } from '../middlewares/rateLimit';
import {
  createContact,
  getContacts,
  deleteContact,
} from '../controllers/Contact';
import { exportContacts } from '../controllers/Export';

const router = Router();

router.post('/', contactLimiter, createContact);
router.get('/export', authenticateAdmin, requireSuperAdmin, exportContacts);
router.get('/', authenticateAdmin, getContacts);
router.delete('/:id', authenticateAdmin, deleteContact);

export default router;
