import { Router, Request, Response } from 'express';
import adminRouter from './admin';
import blogsRouter from './blogs';
import jobPostRouter from './jobPost.routes';
import jobApplicationRouter from './jobApplication.routes';
import contactRouter from './contact.routes';

const router = Router();

// Mount routes
router.use('/admin', adminRouter);
router.use('/blogs', blogsRouter);
router.use('/job-posts', jobPostRouter);
router.use('/job-applications', jobApplicationRouter);
router.use('/contact', contactRouter);

// API Root endpoint
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Welcome to the Logixmart Backend API',
    version: '1.0.0',
  });
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'UP',
    timestamp: new Date().toISOString(),
  });
});

export default router;
