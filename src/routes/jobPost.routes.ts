import { Router } from 'express';
import { authenticateAdmin } from '../middlewares/auth';
import { applicationLimiter } from '../middlewares/rateLimit';
import { resumeUpload } from '../middlewares/upload';
import {
  createJobPost,
  getJobPosts,
  getJobPostById,
  updateJobPost,
  deleteJobPost,
} from '../controllers/JobPost';
import { createJobApplication, createJobApplicationResumeUploadUrl } from '../controllers/JobApplication';

const router = Router();

// Public list / detail (careers page)
router.get('/', getJobPosts);
router.get('/:id', getJobPostById);

// Public direct-to-Supabase resume upload URL (JSON, no auth)
router.post(
  '/:jobId/applications/resume/upload-url',
  applicationLimiter,
  createJobApplicationResumeUploadUrl
);

// Public apply (multipart, optional resume; resumePath accepted for direct uploads)
router.post(
  '/:jobId/applications',
  applicationLimiter,
  resumeUpload.single('resume'),
  createJobApplication
);

// Admin-only mutations
router.post('/', authenticateAdmin, createJobPost);
router.patch('/:id', authenticateAdmin, updateJobPost);
router.delete('/:id', authenticateAdmin, deleteJobPost);

export default router;
