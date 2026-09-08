import { Router } from 'express';
import { authenticateAdmin } from '../middlewares/auth';
import { ourWorkUpload } from '../middlewares/upload';
import {
  getOurWorks,
  getOurWorkById,
  createOurWork,
  updateOurWork,
  deleteOurWork,
} from '../controllers/OurWork';

const router = Router();

router.get('/', getOurWorks);
router.get('/:id', getOurWorkById);
router.post(
  '/',
  authenticateAdmin,
  ourWorkUpload.array('images', 10),
  createOurWork
);
router.put(
  '/:id',
  authenticateAdmin,
  ourWorkUpload.array('images', 10),
  updateOurWork
);
router.delete('/:id', authenticateAdmin, deleteOurWork);

export default router;
