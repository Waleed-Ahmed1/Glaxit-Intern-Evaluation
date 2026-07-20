import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import {
    createHmac,
    randomInt,
    timingSafeEqual,
} from 'node:crypto';

import { createRequire } from 'node:module';

import {
    createUser,
    findUserByEmail,
} from '../models/user.model.js';

import {
    consumeRegistrationOtp,
    deleteRegistrationOtp,
    findRegistrationOtp,
    incrementRegistrationOtpAttempts,
    saveRegistrationOtp,
} from '../models/otp.model.js';

import {
    sendRegistrationOtpEmail,
} from '../services/email.service.js';

const require = createRequire(import.meta.url);

const importedDisposableDomains =
    require('disposable-email-domains');

const ADMIN_EMAIL_DOMAIN = 'glaxit.com';

const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const EMAIL_PATTERN =
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const VALID_DOMAINS = [
    'Frontend Development',
    'Backend Development',
    'Full Stack Development',
    'Mobile App Development',
    'Data Science',
    'DevOps',
    'UI/UX Design',
    'Quality Assurance',
];

const packageDisposableDomains =
    Array.isArray(importedDisposableDomains)
        ? importedDisposableDomains
        : Array.isArray(
              importedDisposableDomains?.default
          )
            ? importedDisposableDomains.default
            : [];

const customBlockedDomains = String(
    process.env.BLOCKED_EMAIL_DOMAINS || ''
)
    .split(',')
    .map((domain) =>
        domain.trim().toLowerCase()
    )
    .filter(Boolean);

const DISPOSABLE_EMAIL_DOMAINS = new Set(
    [
        ...packageDisposableDomains,
        ...customBlockedDomains,
    ]
        .map((domain) =>
            String(domain)
                .trim()
                .toLowerCase()
        )
        .filter(Boolean)
);

function normalizeEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase();
}

function normalizeName(name) {
    return String(name || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function getEmailDomain(email) {
    return (
        normalizeEmail(email)
            .split('@')[1] || ''
    );
}

function isDisposableEmailDomain(domain) {
    const parts = String(domain || '')
        .toLowerCase()
        .split('.')
        .filter(Boolean);

    /*
     * Check the complete domain and then each
     * parent domain.
     *
     * Example:
     * sub.mailinator.com
     * mailinator.com
     */
    for (
        let index = 0;
        index < parts.length - 1;
        index += 1
    ) {
        const domainToCheck =
            parts.slice(index).join('.');

        if (
            DISPOSABLE_EMAIL_DOMAINS.has(
                domainToCheck
            )
        ) {
            return true;
        }
    }

    return false;
}

function validateRole(role) {
    if (
        role === 'admin' ||
        role === 'student'
    ) {
        return role;
    }

    return null;
}

function validateEmailForRole(
    email,
    role
) {
    if (!EMAIL_PATTERN.test(email)) {
        return 'Please enter a valid email address';
    }

    const domain =
        getEmailDomain(email);

    if (
        role === 'admin' &&
        domain !== ADMIN_EMAIL_DOMAIN
    ) {
        return (
            `Admin accounts must use an ` +
            `@${ADMIN_EMAIL_DOMAIN} email address`
        );
    }

    if (
        role === 'student' &&
        isDisposableEmailDomain(domain)
    ) {
        return (
            'Temporary or disposable email ' +
            'addresses are not allowed'
        );
    }

    return null;
}

function getOtpSecret() {
    const secret =
        process.env.OTP_SECRET ||
        process.env.JWT_SECRET;

    if (!secret) {
        throw new Error(
            'OTP_SECRET or JWT_SECRET is not configured'
        );
    }

    return secret;
}

function hashOtp({
    email,
    role,
    otp,
}) {
    return createHmac(
        'sha256',
        getOtpSecret()
    )
        .update(
            `registration:${role}:` +
            `${normalizeEmail(email)}:${otp}`
        )
        .digest('hex');
}

function hashesMatch(
    firstHash,
    secondHash
) {
    try {
        const first =
            Buffer.from(firstHash, 'hex');

        const second =
            Buffer.from(secondHash, 'hex');

        return (
            first.length === second.length &&
            timingSafeEqual(first, second)
        );
    } catch {
        return false;
    }
}

function signToken(user) {
    return jwt.sign(
        {
            id: user._id,
            role: user.role,
            email: user.email,
            domain: user.domain || null,
        },
        process.env.JWT_SECRET,
        {
            expiresIn:
                process.env.JWT_EXPIRES_IN ||
                '7d',
        }
    );
}

/*
 * STEP ONE
 *
 * Validate the email and send the OTP.
 * No user account is created here.
 */
export async function requestRegistrationOtp(
    req,
    res
) {
    try {
        const email =
            normalizeEmail(req.body.email);

        const role =
            validateRole(req.body.role);

        if (!role) {
            return res.status(400).json({
                error:
                    'Please select a valid account type',
            });
        }

        const emailError =
            validateEmailForRole(
                email,
                role
            );

        if (emailError) {
            return res.status(400).json({
                error: emailError,
            });
        }

        const existingUser =
            await findUserByEmail(email);

        if (existingUser) {
            return res.status(409).json({
                error:
                    'A user with this email already exists',
            });
        }

        const now = new Date();

        const previousOtp =
            await findRegistrationOtp(email);

        /*
         * Prevent repeatedly sending emails
         * to the same address.
         */
        if (previousOtp?.lastSentAt) {
            const elapsed =
                now.getTime() -
                new Date(
                    previousOtp.lastSentAt
                ).getTime();

            if (
                elapsed <
                OTP_RESEND_COOLDOWN_MS
            ) {
                const retryAfterSeconds =
                    Math.ceil(
                        (
                            OTP_RESEND_COOLDOWN_MS -
                            elapsed
                        ) / 1000
                    );

                return res
                    .status(429)
                    .json({
                        error:
                            `Please wait ` +
                            `${retryAfterSeconds} seconds ` +
                            `before requesting another code`,

                        retryAfterSeconds,
                    });
            }
        }

        /*
         * randomInt is cryptographically secure.
         * It always creates a six-digit number.
         */
        const otp = String(
            randomInt(
                100000,
                1000000
            )
        );

        const expiresAt = new Date(
            now.getTime() +
            OTP_TTL_MS
        );

        /*
         * The plain OTP is never stored
         * in MongoDB.
         */
        const otpHash = hashOtp({
            email,
            role,
            otp,
        });

        await saveRegistrationOtp({
            email,
            role,
            otpHash,
            expiresAt,
            sentAt: now,
        });

        try {
            await sendRegistrationOtpEmail({
                to: email,
                otp,
            });
        } catch (emailError) {
            /*
             * Do not leave an unusable OTP
             * record when email delivery fails.
             */
            await deleteRegistrationOtp(
                email
            );

            console.error(
                'Registration OTP email error:',
                emailError
            );

            return res.status(500).json({
                error:
                    'Could not send the verification ' +
                    'email. Please try again.',
            });
        }

        return res.json({
            message:
                'Verification code sent successfully',

            email,

            expiresInSeconds:
                OTP_TTL_MS / 1000,

            resendAfterSeconds:
                OTP_RESEND_COOLDOWN_MS /
                1000,
        });
    } catch (error) {
        console.error(
            'Request registration OTP error:',
            error
        );

        return res.status(500).json({
            error:
                'Could not create a verification code',
        });
    }
}

/*
 * STEP TWO
 *
 * Verify the submitted OTP and create
 * the account only when it is valid.
 */
export async function register(
    req,
    res
) {
    try {
        const name =
            normalizeName(req.body.name);

        const email =
            normalizeEmail(req.body.email);

        const password =
            String(
                req.body.password || ''
            );

        const role =
            validateRole(req.body.role);

        const domain =
            req.body.domain;

        const otp =
            String(req.body.otp || '')
                .trim();

        if (
            !name ||
            !email ||
            !password ||
            !role ||
            !otp
        ) {
            return res.status(400).json({
                error:
                    'Name, email, password, ' +
                    'account type, and verification ' +
                    'code are required',
            });
        }

        if (
            name.length < 2 ||
            name.length > 80
        ) {
            return res.status(400).json({
                error:
                    'Name must be between ' +
                    '2 and 80 characters',
            });
        }

        if (
            password.length < 8 ||
            password.length > 72
        ) {
            return res.status(400).json({
                error:
                    'Password must be between ' +
                    '8 and 72 characters',
            });
        }

        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                error:
                    'Enter the complete 6-digit ' +
                    'verification code',
            });
        }

        /*
         * Recheck email restrictions here.
         * Frontend validation cannot be trusted.
         */
        const emailError =
            validateEmailForRole(
                email,
                role
            );

        if (emailError) {
            return res.status(400).json({
                error: emailError,
            });
        }

        const safeDomain =
            role === 'student'
                ? VALID_DOMAINS.includes(
                      domain
                  )
                    ? domain
                    : null
                : null;

        if (
            role === 'student' &&
            !safeDomain
        ) {
            return res.status(400).json({
                error:
                    'Please select a valid domain',
            });
        }

        const existingUser =
            await findUserByEmail(email);

        if (existingUser) {
            return res.status(409).json({
                error:
                    'A user with this email already exists',
            });
        }

        const otpRecord =
            await findRegistrationOtp(
                email
            );

        if (
            !otpRecord ||
            otpRecord.role !== role
        ) {
            return res.status(400).json({
                error:
                    'No valid verification request ' +
                    'was found. Please request a new code.',
            });
        }

        if (
            new Date(
                otpRecord.expiresAt
            ).getTime() <= Date.now()
        ) {
            await deleteRegistrationOtp(
                email
            );

            return res.status(400).json({
                error:
                    'The verification code has expired. ' +
                    'Please request a new code.',
            });
        }

        if (
            (otpRecord.attempts || 0) >=
            OTP_MAX_ATTEMPTS
        ) {
            await deleteRegistrationOtp(
                email
            );

            return res.status(429).json({
                error:
                    'Too many incorrect attempts. ' +
                    'Please request a new code.',
            });
        }

        const submittedHash =
            hashOtp({
                email,
                role,
                otp,
            });

        if (
            !hashesMatch(
                otpRecord.otpHash,
                submittedHash
            )
        ) {
            const updatedRecord =
                await incrementRegistrationOtpAttempts(
                    email
                );

            const attempts =
                updatedRecord?.attempts ||
                (otpRecord.attempts || 0) +
                    1;

            const attemptsRemaining =
                Math.max(
                    OTP_MAX_ATTEMPTS -
                        attempts,
                    0
                );

            if (
                attemptsRemaining === 0
            ) {
                await deleteRegistrationOtp(
                    email
                );

                return res
                    .status(429)
                    .json({
                        error:
                            'Too many incorrect attempts. ' +
                            'Please request a new code.',
                    });
            }

            return res.status(400).json({
                error:
                    `Incorrect verification code. ` +
                    `${attemptsRemaining} ` +
                    `attempt${
                        attemptsRemaining === 1
                            ? ''
                            : 's'
                    } remaining.`,
            });
        }

        const passwordHash =
            await bcrypt.hash(
                password,
                10
            );

        /*
         * Atomically remove the OTP.
         * Only one request can successfully
         * consume the code.
         */
        const consumedOtp =
            await consumeRegistrationOtp({
                email,
                role,
                otpHash: submittedHash,
            });

        if (!consumedOtp) {
            return res.status(400).json({
                error:
                    'The verification code has expired ' +
                    'or has already been used',
            });
        }

        const user =
            await createUser({
                name,
                email,
                passwordHash,
                role,
                domain: safeDomain,
            });

        /*
         * Do not automatically log the user in.
         * The frontend sends them to the login page.
         */
        return res.status(201).json({
            message:
                'Account created successfully',

            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                domain: user.domain,
            },
        });
    } catch (error) {
        /*
         * The unique MongoDB index also protects
         * against simultaneous duplicate registrations.
         */
        if (error?.code === 11000) {
            return res.status(409).json({
                error:
                    'A user with this email already exists',
            });
        }

        console.error(
            'Register error:',
            error
        );

        return res.status(500).json({
            error:
                'Something went wrong during registration',
        });
    }
}

export async function login(
    req,
    res
) {
    try {
        const email =
            normalizeEmail(req.body.email);

        const password =
            String(
                req.body.password || ''
            );

        if (!email || !password) {
            return res.status(400).json({
                error:
                    'Email and password are required',
            });
        }

        const user =
            await findUserByEmail(email);

        if (!user) {
            return res.status(401).json({
                error:
                    'Invalid email or password',
            });
        }

        const isMatch =
            await bcrypt.compare(
                password,
                user.passwordHash
            );

        if (!isMatch) {
            return res.status(401).json({
                error:
                    'Invalid email or password',
            });
        }

        const token =
            signToken(user);

        return res.json({
            token,

            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                domain: user.domain,
            },
        });
    } catch (error) {
        console.error(
            'Login error:',
            error
        );

        return res.status(500).json({
            error:
                'Something went wrong during login',
        });
    }
}