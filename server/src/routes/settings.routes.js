import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { getCode, updateCode, verifyCode } from '../controllers/settings.controller.js';

const router = Router();

router.get('/submission-code', requireAuth, requireRole('admin'), getCode);
router.put('/submission-code', requireAuth, requireRole('admin'), updateCode);
router.post('/submission-code/verify', requireAuth, verifyCode); // any logged-in user, not admin-only

export default router;