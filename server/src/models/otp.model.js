import { getDB } from '../config/db.js';

const COLLECTION = 'registration_otps';

// This collection stores one-time codes for more than just registration
// (registration + password reset), distinguished by the `purpose` field.
export const OTP_PURPOSE_REGISTRATION = 'registration';
export const OTP_PURPOSE_PASSWORD_RESET = 'password_reset';

function otpCollection() {
    return getDB().collection(COLLECTION);
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export async function findOtp(email, purpose) {
    return otpCollection().findOne({
        email: normalizeEmail(email),
        purpose,
    });
}

export async function saveOtp({
    email,
    purpose,
    role = null,
    otpHash,
    expiresAt,
    sentAt = new Date(),
}) {
    const normalizedEmail = normalizeEmail(email);

    await otpCollection().updateOne(
        {
            email: normalizedEmail,
            purpose,
        },
        {
            $set: {
                email: normalizedEmail,
                purpose,
                role,
                otpHash,
                attempts: 0,
                expiresAt,
                lastSentAt: sentAt,
            },
            $setOnInsert: {
                createdAt: sentAt,
            },
        },
        { upsert: true }
    );
}

export async function incrementOtpAttempts(email, purpose) {
    return otpCollection().findOneAndUpdate(
        {
            email: normalizeEmail(email),
            purpose,
        },
        {
            $inc: { attempts: 1 },
            $set: { lastAttemptAt: new Date() },
        },
        {
            returnDocument: 'after',
        }
    );
}

export async function consumeOtp({
    email,
    purpose,
    otpHash,
    role,
}) {
    const filter = {
        email: normalizeEmail(email),
        purpose,
        otpHash,
        attempts: { $lt: 5 },
        expiresAt: { $gt: new Date() },
    };

    if (role) {
        filter.role = role;
    }

    return otpCollection().findOneAndDelete(filter);
}

export async function deleteOtp(email, purpose) {
    await otpCollection().deleteOne({
        email: normalizeEmail(email),
        purpose,
    });
}

/*
 * ---------------------------------------------------------------------
 * Backwards-compatible registration-specific wrappers
 * (kept so existing registration code doesn't need to change).
 * ---------------------------------------------------------------------
 */

export async function findRegistrationOtp(email) {
    return findOtp(email, OTP_PURPOSE_REGISTRATION);
}

export async function saveRegistrationOtp({ email, role, otpHash, expiresAt, sentAt }) {
    return saveOtp({
        email,
        purpose: OTP_PURPOSE_REGISTRATION,
        role,
        otpHash,
        expiresAt,
        sentAt,
    });
}

export async function incrementRegistrationOtpAttempts(email) {
    return incrementOtpAttempts(email, OTP_PURPOSE_REGISTRATION);
}

export async function consumeRegistrationOtp({ email, role, otpHash }) {
    return consumeOtp({
        email,
        purpose: OTP_PURPOSE_REGISTRATION,
        role,
        otpHash,
    });
}

export async function deleteRegistrationOtp(email) {
    return deleteOtp(email, OTP_PURPOSE_REGISTRATION);
}

/*
 * ---------------------------------------------------------------------
 * Password-reset-specific wrappers
 * ---------------------------------------------------------------------
 */

export async function findPasswordResetOtp(email) {
    return findOtp(email, OTP_PURPOSE_PASSWORD_RESET);
}

export async function savePasswordResetOtp({ email, otpHash, expiresAt, sentAt }) {
    return saveOtp({
        email,
        purpose: OTP_PURPOSE_PASSWORD_RESET,
        otpHash,
        expiresAt,
        sentAt,
    });
}

export async function incrementPasswordResetOtpAttempts(email) {
    return incrementOtpAttempts(email, OTP_PURPOSE_PASSWORD_RESET);
}

export async function consumePasswordResetOtp({ email, otpHash }) {
    return consumeOtp({
        email,
        purpose: OTP_PURPOSE_PASSWORD_RESET,
        otpHash,
    });
}

export async function deletePasswordResetOtp(email) {
    return deleteOtp(email, OTP_PURPOSE_PASSWORD_RESET);
}