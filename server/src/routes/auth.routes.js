import { Router } from 'express';

import {
    login,
    register,
    requestRegistrationOtp,
    requestPasswordResetOtp,
    verifyPasswordResetOtp,
    resetPassword,
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

// Forgot password: request a code, verify it, then set a new password.
router.post(
    '/request-password-reset-otp',
    requestPasswordResetOtp
);

router.post(
    '/verify-password-reset-otp',
    verifyPasswordResetOtp
);

router.post(
    '/reset-password',
    resetPassword
);

export default router;