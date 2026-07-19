import { getDB } from '../config/db.js';

const COLLECTION = 'attempts';

export function attemptsCollection() {
    return getDB().collection(COLLECTION);
}

export async function createAttempt({ quizId, studentId, answers, score, total, violationCount, autoSubmitted, timeTakenSeconds, terminationReason }) {
    const { ObjectId } = await import('mongodb');
    const doc = {
        quizId: new ObjectId(quizId),
        studentId,
        answers,
        score,
        total,
        violationCount: violationCount || 0,
        autoSubmitted: !!autoSubmitted,
        timeTakenSeconds: Number(timeTakenSeconds) || 0,
        terminationReason: terminationReason || null, // e.g. 'tab_switch'
        submittedAt: new Date(),
    };
    const result = await attemptsCollection().insertOne(doc);
    return { _id: result.insertedId, ...doc };
}

// Admin-only: every attempt across every student, used to aggregate
// per-domain performance stats (see quiz.controller.js#domainStats).
export async function listAllAttempts() {
    return attemptsCollection().find({}).toArray();
}

export async function listAttemptsForStudent(studentId) {
    return attemptsCollection().find({ studentId }).sort({ submittedAt: -1 }).toArray();
}

export async function listAttemptsForQuiz(quizId) {
    const { ObjectId } = await import('mongodb');
    return attemptsCollection().find({ quizId: new ObjectId(quizId) }).sort({ submittedAt: -1 }).toArray();
}