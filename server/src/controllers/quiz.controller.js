import { randomUUID } from 'crypto';
import {
    createQuiz,
    listQuizzes,
    getQuizById,
    updateQuiz,
    deleteQuiz,
} from '../models/quiz.model.js';
import { createAttempt, listAttemptsForStudent, listAllAttempts } from '../models/attempt.model.js';
import { listUsers } from '../models/user.model.js';

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

// Student-only: this student's rank among every OTHER student who shares
// their domain (their real "peer group" for a fair comparison), based on
// total marks scored across all of that student's quiz attempts.
//
// Ties use standard "competition ranking": students with the exact same
// total marks share the same rank (e.g. two students tied for 1st both
// show rank 1), and the next distinct total jumps by however many people
// were tied above it (e.g. 1, 1, 3 — not 1, 1, 2).
export async function myRank(req, res) {
    try {
        if (req.user.role === 'admin') {
            return res.json({ rank: null, totalStudents: 0, score: 0, domain: null });
        }

        const domain = req.user.domain;
        if (!domain) {
            return res.json({ rank: null, totalStudents: 0, score: 0, domain: null });
        }

        // Every student sharing this domain is a peer for ranking purposes.
        const peers = await listUsers({ role: 'student', domain });

        // Sum each peer's total marks across every quiz they've attempted.
        const totals = await Promise.all(
            peers.map(async (peer) => {
                const peerId = peer._id.toString();
                const attempts = await listAttemptsForStudent(peerId);
                const total = attempts.reduce((sum, a) => sum + (a.score || 0), 0);
                return { studentId: peerId, total };
            })
        );

        // Highest total marks first.
        totals.sort((a, b) => b.total - a.total);

        let rank = 0;
        let previousTotal = null;
        const ranked = totals.map((entry, index) => {
            // Only advance the rank number when the total actually changes —
            // this is what makes tied students share a rank.
            if (previousTotal === null || entry.total !== previousTotal) {
                rank = index + 1;
                previousTotal = entry.total;
            }
            return { ...entry, rank };
        });

        const me = ranked.find((r) => r.studentId === req.user.id);

        res.json({
            rank: me ? me.rank : null,
            totalStudents: ranked.length,
            score: me ? me.total : 0,
            domain,
        });
    } catch (err) {
        console.error('My rank error:', err);
        res.status(500).json({ error: 'Something went wrong computing your rank' });
    }
}

// Passing threshold used only for the admin "Pass Rate" metric below —
// a completed attempt counts as a pass once it clears 50% of that quiz's
// total points. This does not affect a student's actual score/total shown
// anywhere else, it's purely for aggregation.
const PASS_THRESHOLD_FRACTION = 0.5;

// Admin-only: real per-domain performance for the Overview chart —
// average score %, pass rate %, and engagement % (share of that domain's
// students who have attempted at least one quiz), all computed live from
// actual quiz attempts rather than hardcoded sample numbers.
export async function domainStats(req, res) {
    try {
        const [allQuizzes, allAttempts, allStudents] = await Promise.all([
            listQuizzes({}), // every quiz regardless of status — we only need each quiz's domain
            listAllAttempts(),
            listUsers({ role: 'student' }),
        ]);

        const quizDomainMap = new Map(allQuizzes.map((q) => [q._id.toString(), q.domain || 'Unassigned']));

        const byDomain = new Map(); // domain -> { totalScore, totalPossible, attemptCount, passCount, studentsAttempted: Set }
        function bucket(domain) {
            if (!byDomain.has(domain)) {
                byDomain.set(domain, {
                    totalScore: 0,
                    totalPossible: 0,
                    attemptCount: 0,
                    passCount: 0,
                    studentsAttempted: new Set(),
                });
            }
            return byDomain.get(domain);
        }

        // Seed every domain that actually has students, so a domain with
        // students but zero attempts yet still shows up on the chart at 0%
        // instead of silently disappearing.
        const studentsByDomain = new Map(); // domain -> Set(studentId)
        for (const s of allStudents) {
            const domain = s.domain || 'Unassigned';
            if (!studentsByDomain.has(domain)) studentsByDomain.set(domain, new Set());
            studentsByDomain.get(domain).add(s._id.toString());
            bucket(domain);
        }

        for (const a of allAttempts) {
            const domain = quizDomainMap.get(a.quizId.toString()) || 'Unassigned';
            const b = bucket(domain);
            b.totalScore += a.score || 0;
            b.totalPossible += a.total || 0;
            b.attemptCount += 1;
            b.studentsAttempted.add(a.studentId);
            if (a.total > 0 && a.score / a.total >= PASS_THRESHOLD_FRACTION) {
                b.passCount += 1;
            }
        }

        const result = [...byDomain.entries()]
            .map(([domain, b]) => {
                const domainStudents = studentsByDomain.get(domain) || new Set();
                const avgScore = b.totalPossible > 0 ? Math.round((b.totalScore / b.totalPossible) * 100) : 0;
                const passRate = b.attemptCount > 0 ? Math.round((b.passCount / b.attemptCount) * 100) : 0;
                const engagement = domainStudents.size > 0
                    ? Math.round((b.studentsAttempted.size / domainStudents.size) * 100)
                    : 0;
                return {
                    domain,
                    avgScore,
                    passRate,
                    engagement,
                    attemptCount: b.attemptCount,
                    studentCount: domainStudents.size,
                };
            })
            .sort((x, y) => x.domain.localeCompare(y.domain));

        res.json(result);
    } catch (err) {
        console.error('Domain stats error:', err);
        res.status(500).json({ error: 'Something went wrong computing domain performance' });
    }
}