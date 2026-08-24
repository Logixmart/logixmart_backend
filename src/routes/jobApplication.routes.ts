import { Router } from 'express';
import { authenticateAdmin } from '../middlewares/auth';
import {
  getJobApplications,
  getJobApplicationById,
  updateJobApplicationStatus,
  deleteJobApplication,
} from '../controllers/JobApplication';

const router = Router();

router.get('/', authenticateAdmin, getJobApplications);
router.get('/:id', authenticateAdmin, getJobApplicationById);
router.patch('/:id/status', authenticateAdmin, updateJobApplicationStatus);
router.delete('/:id', authenticateAdmin, deleteJobApplication);

export default router;
