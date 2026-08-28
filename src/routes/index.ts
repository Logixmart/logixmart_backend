import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import adminRouter from './admin';
import blogsRouter from './blogs';
import jobPostRouter from './jobPost.routes';
import jobApplicationRouter from './jobApplication.routes';
import contactRouter from './contact.routes';
import clientReviewRouter from './clientReview.routes';
import ourWorksRouter from './ourWorks';

const router = Router();

router.use('/admin', adminRouter);
router.use('/blogs', blogsRouter);
router.use('/job-posts', jobPostRouter);
router.use('/job-applications', jobApplicationRouter);
router.use('/contact', contactRouter);
router.use('/client-reviews', clientReviewRouter);
router.use('/our-works', ourWorksRouter);

router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Welcome to the Logixmart Backend API',
    version: '1.0.0',
  });
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      status: 'UP',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      success: false,
      status: 'DOWN',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
