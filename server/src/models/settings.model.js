import { getDB } from '../config/db.js';

const COLLECTION = 'settings';

// One fixed document holds the completion code — there's only ever one
// code for the whole app, not one per quiz, so a single well-known _id is
// simplest rather than modeling a list of settings.
const SUBMISSION_CODE_DOC_ID = 'submission_code';

function settingsCollection() {
    return getDB().collection(COLLECTION);
}

// Returns '' if the admin hasn't set a code yet. Deliberately returns the
// empty string (not null/undefined) so callers can compare it directly
// against student input without extra null-checks.
export async function getSubmissionCode() {
    const doc = await settingsCollection().findOne({ _id: SUBMISSION_CODE_DOC_ID });
    return doc?.value || '';
}

export async function setSubmissionCode(code) {
    const value = String(code ?? '').trim();
    await settingsCollection().updateOne(
        { _id: SUBMISSION_CODE_DOC_ID },
        { $set: { value, updatedAt: new Date() } },
        { upsert: true }
    );
    return value;
}