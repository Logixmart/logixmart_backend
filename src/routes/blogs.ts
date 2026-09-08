import { Router } from 'express';
import { authenticateAdmin } from '../middlewares/auth';
import { upload } from '../middlewares/upload';
import {
  getBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
} from '../controllers/Blog';

const router = Router();

router.get('/', getBlogs);
router.get('/:id', getBlogById);
router.post('/', authenticateAdmin, upload.single('image'), createBlog);
router.put('/:id', authenticateAdmin, upload.single('image'), updateBlog);
router.delete('/:id', authenticateAdmin, deleteBlog);

export default router;
