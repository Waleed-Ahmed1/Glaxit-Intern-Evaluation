import { Router } from 'express';

import {
    login,
    register,
    requestRegistrationOtp,
} from '../controllers/auth.controller.js';

const router = Router();

router.post(
    '/request-registration-otp',
    requestRegistrationOtp
);

router.post(
    '/register',
    register
);

router.post(
    '/login',
    login
);

export default router;