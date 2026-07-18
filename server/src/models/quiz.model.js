import { getDB } from '../config/db.js';

const COLLECTION = 'quizzes';

export function quizzesCollection() {
    return getDB().collection(COLLECTION);
}

function computeTotalPoints(questions = []) {
    return questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
}

export async function createQuiz({ title, description, domain, difficulty, durationMinutes, questions, createdBy, status, startAt, endAt }) {
    const doc = {
        title,
        description: description || '',
        domain: domain || null, // e.g. 'Frontend Development' — must match a student's own domain to be visible to them
        difficulty: difficulty || 'Medium',
        durationMinutes: durationMinutes || 15,
        startAt: startAt || null, // scheduled quiz start (Date)
        endAt: endAt || null,     // scheduled quiz end (Date) — durationMinutes is derived from (endAt - startAt)
        status: status === 'published' ? 'published' : 'draft',
        questions: questions || [],
        totalPoints: computeTotalPoints(questions),
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const result = await quizzesCollection().insertOne(doc);
    return { _id: result.insertedId, ...doc };
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listQuizzes({ onlyPublished = false, domain } = {}) {
    const filter = onlyPublished ? { status: 'published' } : {};
    if (domain) {
        // Case/whitespace-insensitive match — protects against domain strings
        // that were inserted outside the Register/AdminDashboard dropdowns
        // (e.g. directly in Mongo) with slightly different casing/spacing.
        filter.domain = { $regex: `^${escapeRegex(domain.trim())}$`, $options: 'i' };
    }
    const projection = onlyPublished ? { 'questions.correctIndex': 0 } : {};
    return quizzesCollection().find(filter).project(projection).sort({ createdAt: -1 }).toArray();
}

export async function getQuizById(id, { hideAnswers = false } = {}) {
    const { ObjectId } = await import('mongodb');
    const projection = hideAnswers ? { 'questions.correctIndex': 0 } : {};
    return quizzesCollection().findOne({ _id: new ObjectId(id) }, { projection });
}

export async function updateQuiz(id, updates) {
    const { ObjectId } = await import('mongodb');
    const { _id, createdBy, createdAt, ...safeUpdates } = updates;

    if (safeUpdates.questions) {
        safeUpdates.totalPoints = computeTotalPoints(safeUpdates.questions);
    }
    safeUpdates.updatedAt = new Date();

    const result = await quizzesCollection().findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: safeUpdates },
        { returnDocument: 'after' }
    );
    return result;
}

export async function deleteQuiz(id) {
    const { ObjectId } = await import('mongodb');
    const result = await quizzesCollection().deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
}