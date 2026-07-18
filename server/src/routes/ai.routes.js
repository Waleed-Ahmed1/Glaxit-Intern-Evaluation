import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { generateQuiz } from '../controllers/ai.controller.js';

const router = Router();

router.post('/generate-quiz', requireAuth, requireRole('admin'), generateQuiz);

export default router;