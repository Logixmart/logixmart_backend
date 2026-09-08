import { Router } from 'express';
import { authenticateAdmin } from '../middlewares/auth';
import {
  createClientReview,
  getClientReviews,
  getClientReviewById,
  updateClientReview,
  deleteClientReview,
} from '../controllers/ClientReview';

const router = Router();

// Public list / detail (website testimonials)
router.get('/', getClientReviews);
router.get('/:id', getClientReviewById);

// Admin-only mutations
router.post('/', authenticateAdmin, createClientReview);
router.patch('/:id', authenticateAdmin, updateClientReview);
router.delete('/:id', authenticateAdmin, deleteClientReview);

export default router;
