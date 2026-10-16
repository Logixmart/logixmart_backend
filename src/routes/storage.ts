import { Router } from 'express';
import { authenticateAdmin } from '../middlewares/auth';
import { createUploadUrl } from '../controllers/Storage';

const router = Router();

router.post('/upload-url', authenticateAdmin, createUploadUrl);

export default router;
