import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { create, list, getOne, update, remove, submitAttempt, myAttempts, myRank, studentAttempts, domainStats, exportWorkbook } from '../controllers/quiz.controller.js';

const router = Router();

router.get('/', requireAuth, list);
router.get('/me/attempts', requireAuth, myAttempts); // must stay above '/:id'
router.get('/me/rank', requireAuth, myRank); // must stay above '/:id'
router.get('/domain-stats', requireAuth, requireRole('admin'), domainStats); // must stay above '/:id'
router.get('/export.xlsx', requireAuth, requireRole('admin'), exportWorkbook); // must stay above '/:id'
router.get('/students/:studentId/attempts', requireAuth, requireRole('admin'), studentAttempts); // must stay above '/:id'
router.get('/:id', requireAuth, getOne);
router.post('/', requireAuth, requireRole('admin'), create);
router.post('/:id/submit', requireAuth, submitAttempt);
router.put('/:id', requireAuth, requireRole('admin'), update);
router.delete('/:id', requireAuth, requireRole('admin'), remove);

export default router;