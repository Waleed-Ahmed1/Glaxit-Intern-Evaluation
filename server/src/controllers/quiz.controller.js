import { randomUUID } from 'crypto';
import {
    createQuiz,
    listQuizzes,
    getQuizById,
    updateQuiz,
    deleteQuiz,
} from '../models/quiz.model.js';
import { createAttempt, listAttemptsForStudent } from '../models/attempt.model.js';

function validateQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
        return 'At least one question is required';
    }
    for (const q of questions) {
        if (!q.text || typeof q.text !== 'string') {
            return 'Each question needs text';
        }
        if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !o)) {
            return 'Each question needs exactly 4 non-empty options';
        }
        if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
            return 'Each question needs a valid correctIndex (0-3)';
        }
        if (q.points !== undefined && (typeof q.points !== 'number' || q.points <= 0)) {
            return 'Question points must be a positive number';
        }
    }
    return null;
}

export async function create(req, res) {
    try {
        const { title, description, domain, difficulty, questions, status, startAt, endAt } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Quiz title is required' });
        }

        // Scheduling is mandatory, same as title — the admin picks a date +
        // start time + end time, and duration is always derived from that
        // gap rather than typed in directly.
        if (!startAt || !endAt) {
            return res.status(400).json({ error: 'Start time and end time are required' });
        }

        const startDate = new Date(startAt);
        const endDate = new Date(endAt);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ error: 'Start time and end time must be valid dates' });
        }

        const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

        if (durationMinutes <= 0) {
            return res.status(400).json({ error: 'End time must be after start time' });
        }

        const validationError = validateQuestions(questions);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        const questionsWithIds = questions.map((q) => ({
            id: q.id || randomUUID(),
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex,
            points: q.points || 1,
            difficulty: q.difficulty || 'Easy',
        }));

        const quiz = await createQuiz({
            title,
            description,
            domain,
            difficulty,
            durationMinutes,
            startAt: startDate,
            endAt: endDate,
            questions: questionsWithIds,
            status,
            createdBy: req.user.id,
        });

        res.status(201).json(quiz);
    } catch (err) {
        console.error('Create quiz error:', err);
        res.status(500).json({ error: 'Something went wrong creating the quiz' });
    }
}

export async function list(req, res) {
    try {
        const isAdmin = req.user.role === 'admin';

        // Students only ever see quizzes matching their own domain. If a student
        // has no domain set (e.g. an older account from before this feature),
        // they see no quizzes rather than everything — safer default than leaking
        // unrelated domains to them.
        if (!isAdmin && !req.user.domain) {
            return res.json([]);
        }

        const domain = isAdmin ? undefined : req.user.domain;
        const quizzes = await listQuizzes({ onlyPublished: !isAdmin, domain });
        res.json(quizzes);
    } catch (err) {
        console.error('List quizzes error:', err);
        res.status(500).json({ error: 'Something went wrong fetching quizzes' });
    }
}

export async function getOne(req, res) {
    try {
        const isAdmin = req.user.role === 'admin';
        const quiz = await getQuizById(req.params.id, { hideAnswers: !isAdmin });

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }
        if (!isAdmin && quiz.status !== 'published') {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // The list endpoint only ever shows a student quizzes matching their own
        // domain, but that alone doesn't stop someone hitting this endpoint
        // directly with a different quiz's ID. Enforce it here too.
        if (!isAdmin && quiz.domain && quiz.domain !== req.user.domain) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Enforce the scheduled window using the SERVER's own clock — never
        // the requester's. This is what actually prevents a student from
        // unlocking a quiz early by changing their device's date/time; the
        // frontend "Pending" state is just a UI convenience on top of this.
        if (!isAdmin) {
            const now = Date.now();
            if (quiz.startAt && now < new Date(quiz.startAt).getTime()) {
                return res.status(403).json({ error: 'This quiz has not started yet', startAt: quiz.startAt });
            }
            if (quiz.endAt && now > new Date(quiz.endAt).getTime()) {
                return res.status(403).json({ error: 'This quiz window has closed', endAt: quiz.endAt });
            }
        }

        res.json(quiz);
    } catch (err) {
        console.error('Get quiz error:', err);
        res.status(500).json({ error: 'Something went wrong fetching the quiz' });
    }
}

export async function update(req, res) {
    try {
        const { title, description, domain, difficulty, questions, status, startAt, endAt } = req.body;

        if (questions) {
            const validationError = validateQuestions(questions);
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }
        }

        const updates = { title, description, domain, difficulty, status };

        // If either side of the schedule is being changed, both must be
        // present so duration can be recomputed from the pair — never take
        // durationMinutes directly from the client.
        if (startAt || endAt) {
            if (!startAt || !endAt) {
                return res.status(400).json({ error: 'Both start time and end time are required to update the schedule' });
            }
            const startDate = new Date(startAt);
            const endDate = new Date(endAt);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return res.status(400).json({ error: 'Start time and end time must be valid dates' });
            }
            const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
            if (durationMinutes <= 0) {
                return res.status(400).json({ error: 'End time must be after start time' });
            }
            updates.startAt = startDate;
            updates.endAt = endDate;
            updates.durationMinutes = durationMinutes;
        }

        if (questions) {
            updates.questions = questions.map((q) => ({
                id: q.id || randomUUID(),
                text: q.text,
                options: q.options,
                correctIndex: q.correctIndex,
                points: q.points || 1,
                difficulty: q.difficulty || 'Easy',
            }));
        }
        Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

        const quiz = await updateQuiz(req.params.id, updates);
        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }
        res.json(quiz);
    } catch (err) {
        console.error('Update quiz error:', err);
        res.status(500).json({ error: 'Something went wrong updating the quiz' });
    }
}

export async function remove(req, res) {
    try {
        const deleted = await deleteQuiz(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Quiz not found' });
        }
        res.status(204).send();
    } catch (err) {
        console.error('Delete quiz error:', err);
        res.status(500).json({ error: 'Something went wrong deleting the quiz' });
    }
}

// Students submit their answers here. Scoring happens server-side because
// the correct answers are never sent to the client.
export async function submitAttempt(req, res) {
    try {
        const {
            answers = {},
            violationCount = 0,
            autoSubmitted = false,
            timeTakenSeconds = 0,
            terminationReason = null, // 'tab_switch' — set when force-submitted for repeated tab switching
        } = req.body;
        const isAdmin = req.user.role === 'admin';

        const quiz = await getQuizById(req.params.id, { hideAnswers: false });
        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Same rules getOne() enforces when a student loads the quiz — repeated
        // here because this endpoint can be hit directly, bypassing the UI that
        // would normally have blocked navigation to a mismatched/closed quiz.
        if (!isAdmin) {
            if (quiz.domain && quiz.domain !== req.user.domain) {
                return res.status(404).json({ error: 'Quiz not found' });
            }
            const now = Date.now();
            if (quiz.startAt && now < new Date(quiz.startAt).getTime()) {
                return res.status(403).json({ error: 'This quiz has not started yet' });
            }
            if (quiz.endAt && now > new Date(quiz.endAt).getTime()) {
                return res.status(403).json({ error: 'This quiz window has closed' });
            }
        }

        // Tab-switch terminations always score zero — decided server-side so a
        // tampered client can't submit real answers alongside a fake reason.
        const isTabSwitchTermination = terminationReason === 'tab_switch';

        let score = 0;
        if (!isTabSwitchTermination) {
            quiz.questions.forEach((q) => {
                if (answers[q.id] === q.correctIndex) {
                    score += q.points || 1;
                }
            });
        }

        const attempt = await createAttempt({
            quizId: req.params.id,
            studentId: req.user.id,
            answers,
            score,
            total: quiz.totalPoints,
            violationCount,
            autoSubmitted,
            timeTakenSeconds,
            terminationReason: isTabSwitchTermination ? 'tab_switch' : null,
        });

        res.status(201).json({
            score,
            total: quiz.totalPoints,
            violationCount,
            autoSubmitted,
            terminationReason: attempt.terminationReason,
            attemptId: attempt._id,
        });
    } catch (err) {
        console.error('Submit attempt error:', err);
        res.status(500).json({ error: 'Something went wrong submitting your attempt' });
    }
}

// Student's own quiz history — used by the Performance/Dashboard tabs in Student.jsx.
// Attempts only store quizId, so we join in each quiz's title for display.
export async function myAttempts(req, res) {
    try {
        const attempts = await listAttemptsForStudent(req.user.id);

        const quizIds = [...new Set(attempts.map((a) => a.quizId.toString()))];
        const quizzes = await Promise.all(quizIds.map((id) => getQuizById(id)));
        const quizMap = new Map(quizzes.filter(Boolean).map((q) => [q._id.toString(), q]));

        const result = attempts.map((a) => ({
            _id: a._id,
            quizId: a.quizId,
            quizTitle: quizMap.get(a.quizId.toString())?.title || 'Unknown Quiz',
            score: a.score,
            total: a.total,
            timeTakenSeconds: a.timeTakenSeconds || 0,
            violationCount: a.violationCount,
            autoSubmitted: a.autoSubmitted,
            terminationReason: a.terminationReason || null,
            submittedAt: a.submittedAt,
        }));

        res.json(result);
    } catch (err) {
        console.error('My attempts error:', err);
        res.status(500).json({ error: 'Something went wrong fetching your attempts' });
    }
}

// Admin-only: same shape as myAttempts, but for any student by ID — used by
// the "View" dialog on the Interns table.
export async function studentAttempts(req, res) {
    try {
        const attempts = await listAttemptsForStudent(req.params.studentId);

        const quizIds = [...new Set(attempts.map((a) => a.quizId.toString()))];
        const quizzes = await Promise.all(quizIds.map((id) => getQuizById(id)));
        const quizMap = new Map(quizzes.filter(Boolean).map((q) => [q._id.toString(), q]));

        const result = attempts.map((a) => ({
            _id: a._id,
            quizId: a.quizId,
            quizTitle: quizMap.get(a.quizId.toString())?.title || 'Unknown Quiz',
            score: a.score,
            total: a.total,
            timeTakenSeconds: a.timeTakenSeconds || 0,
            violationCount: a.violationCount,
            autoSubmitted: a.autoSubmitted,
            terminationReason: a.terminationReason || null,
            submittedAt: a.submittedAt,
        }));

        res.json(result);
    } catch (err) {
        console.error('Student attempts error:', err);
        res.status(500).json({ error: "Something went wrong fetching this student's attempts" });
    }
}