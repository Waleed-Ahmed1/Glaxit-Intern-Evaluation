import { getSubmissionCode, setSubmissionCode } from '../models/settings.model.js';

// Admin-only: lets the Management screen show whatever code is currently
// set (blank if none has been configured yet). Students never hit this
// route — they only ever get a score back, never the code itself, from
// the quiz submit endpoint.
export async function getCode(req, res) {
    try {
        const code = await getSubmissionCode();
        res.json({ code });
    } catch (err) {
        console.error('Get submission code error:', err);
        res.status(500).json({ error: 'Could not load the submission code' });
    }
}

// Admin-only: sets or changes the code. No format restrictions — whatever
// string the admin types (numbers, letters, a short phrase) is stored as-is
// and compared byte-for-byte against what a student types at submit time.
export async function updateCode(req, res) {
    try {
        const { code } = req.body;
        if (typeof code !== 'string' || code.trim().length === 0) {
            return res.status(400).json({ error: 'Enter a code before saving' });
        }
        const saved = await setSubmissionCode(code);
        res.json({ code: saved });
    } catch (err) {
        console.error('Update submission code error:', err);
        res.status(500).json({ error: 'Could not save the submission code' });
    }
}