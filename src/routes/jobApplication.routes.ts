import { Router } from 'express';
import {
  authenticateAdmin,
  requireSuperAdmin,
} from '../middlewares/auth';
import {
  getJobApplications,
  getJobApplicationById,
  updateJobApplicationStatus,
  deleteJobApplication,
  downloadJobApplicationResume,
} from '../controllers/JobApplication';
import { exportJobApplications } from '../controllers/Export';

const router = Router();

router.get(
  '/export',
  authenticateAdmin,
  requireSuperAdmin,
  exportJobApplications
);
router.get('/', authenticateAdmin, getJobApplications);
router.get('/:id/resume', authenticateAdmin, downloadJobApplicationResume);
router.get('/:id', authenticateAdmin, getJobApplicationById);
router.patch('/:id/status', authenticateAdmin, updateJobApplicationStatus);
router.delete('/:id', authenticateAdmin, deleteJobApplication);

export default router;
