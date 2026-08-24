import { Router } from 'express';
import { authenticateAdmin } from '../middlewares/auth';
import { resumeUpload } from '../middlewares/upload';
import {
  createJobPost,
  getJobPosts,
  getJobPostById,
  updateJobPost,
  deleteJobPost,
} from '../controllers/JobPost';
import { createJobApplication } from '../controllers/JobApplication';

const router = Router();

// Public list / detail (careers page)
router.get('/', getJobPosts);
router.get('/:id', getJobPostById);

// Public apply (multipart, optional resume)
router.post(
  '/:jobId/applications',
  resumeUpload.single('resume'),
  createJobApplication
);

// Admin-only mutations
router.post('/', authenticateAdmin, createJobPost);
router.patch('/:id', authenticateAdmin, updateJobPost);
router.delete('/:id', authenticateAdmin, deleteJobPost);

export default router;
