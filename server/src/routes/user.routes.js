import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { list } from '../controllers/user.controller.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), list);

export default router;