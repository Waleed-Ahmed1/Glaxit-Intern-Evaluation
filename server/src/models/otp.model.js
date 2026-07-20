import { getDB } from '../config/db.js';

const COLLECTION = 'registration_otps';
const PURPOSE = 'registration';

function otpCollection() {
    return getDB().collection(COLLECTION);
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export async function findRegistrationOtp(email) {
    return otpCollection().findOne({
        email: normalizeEmail(email),
        purpose: PURPOSE,
    });
}

export async function saveRegistrationOtp({
    email,
    role,
    otpHash,
    expiresAt,
    sentAt = new Date(),
}) {
    const normalizedEmail = normalizeEmail(email);

    await otpCollection().updateOne(
        {
            email: normalizedEmail,
            purpose: PURPOSE,
        },
        {
            $set: {
                email: normalizedEmail,
                purpose: PURPOSE,
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

export async function incrementRegistrationOtpAttempts(email) {
    return otpCollection().findOneAndUpdate(
        {
            email: normalizeEmail(email),
            purpose: PURPOSE,
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

export async function consumeRegistrationOtp({
    email,
    role,
    otpHash,
}) {
    return otpCollection().findOneAndDelete({
        email: normalizeEmail(email),
        purpose: PURPOSE,
        role,
        otpHash,
        attempts: { $lt: 5 },
        expiresAt: { $gt: new Date() },
    });
}

export async function deleteRegistrationOtp(email) {
    await otpCollection().deleteOne({
        email: normalizeEmail(email),
        purpose: PURPOSE,
    });
}