import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import "./QuizPage.css";

// In production (Vercel) client + API share the same domain, so '/api' just
// works with no config. Locally, set VITE_API_BASE=http://localhost:3000/api
// in client/.env so the dev server (on a different port) still reaches Express.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';
// Allowance before the quiz is force-submitted. Switch 1 -> "2 warnings
// remaining", switch 2 -> "1 warning remaining", switch 3 -> quiz is
// submitted immediately with a score of 0 (no further warning shown).
// This limit only applies to tab switching, not to exiting fullscreen.
const MAX_TAB_SWITCHES = 3;

// Circular countdown ring — value/max drives how much of the ring is filled.
// The label ("Minutes" / "Seconds") now sits beside the ring as its own text,
// not stacked inside it — the ring itself only ever shows the number.
function TimerRing({ value, max, label }) {
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const offset = circumference * (1 - fraction);

    return (
        <div className="timer-unit">
            <span className="timer-unit-label">{label} :</span>
            <div className="timer-ring">
                <svg viewBox="0 0 80 80">
                    <circle className="timer-ring-track" cx="40" cy="40" r={radius} />
                    <circle
                        className="timer-ring-progress"
                        cx="40"
                        cy="40"
                        r={radius}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                    />
                </svg>
                <div className="timer-ring-center">
                    <span className="timer-ring-value">{String(value).padStart(2, '0')}</span>
                </div>
            </div>
        </div>
    );
}

const QuizPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [quiz, setQuiz] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState({});

    // Same pattern as Quizinstructions.jsx's fromDashboard check: this page
    // should only ever be reached via the instructions page's "Start Quiz"
    // button, which sets this flag. Anyone opening /quiz/:id/take directly —
    // a pasted link, a shared URL, a fresh tab — gets sent back through the
    // proper flow instead of dropping straight into a live, fullscreen,
    // timed attempt.
    const cameFromInstructions = !!location.state?.fromInstructions;

    useEffect(() => {
        if (!cameFromInstructions) {
            navigate(`/quiz/${id}`, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameFromInstructions, id]);

    // Real countdown, seeded from the quiz's own durationMinutes (from the backend)
    const [timeLeft, setTimeLeft] = useState(0);

    // Read-only display value, same localStorage read used elsewhere in the app
    const user = JSON.parse(localStorage.getItem('quiz_user') || '{}');

    useEffect(() => {
        if (!cameFromInstructions) return; // don't fetch the quiz for a gated direct visit
        async function fetchQuiz() {
            try {
                const token = localStorage.getItem('quiz_token');
                const res = await fetch(`${API_BASE}/quizzes/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    setQuiz(data);
                    setTimeLeft((data.durationMinutes || 15) * 60);
                }
                setLoading(false);
            } catch {
                setLoading(false);
            }
        }
        fetchQuiz();
    }, [id, cameFromInstructions]);

    // Tick every second once the quiz (and its real duration) has loaded
    useEffect(() => {
        if (!quiz || timeLeft <= 0) return;
        const timer = setInterval(() => setTimeLeft((prev) => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(timer);
    }, [quiz, timeLeft]);

    // Time's up: submit automatically with whatever's been answered so far,
    // instead of just letting the countdown sit at 0 while the quiz stays
    // open. Guarded by `submitting`/`result` so this can't double-fire
    // alongside a manual Finish click that lands in the same instant.
    useEffect(() => {
        if (!quiz || result || submitting) return;
        if (timeLeft <= 0) {
            handleSubmit(true, 'time_up');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLeft, quiz]);

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [result, setResult] = useState(null); // { score, total } once the backend confirms it

    // --- Completion code popup ---
    // Set by the admin on the Management screen. Required for a normal
    // Finish click or the timer running out; NOT required for a tab-switch
    // auto-submit, which keeps scoring 0 immediately exactly as before.
    const [showCodeModal, setShowCodeModal] = useState(false);
    const [enteredCode, setEnteredCode] = useState('');
    const [codeAttemptsLeft, setCodeAttemptsLeft] = useState(3);
    const [codeError, setCodeError] = useState('');
    const [verifyingCode, setVerifyingCode] = useState(false);
    const pendingSubmissionRef = useRef(null); // { auto, terminationReason } waiting on the code popup

    // Once the backend confirms the result, show it briefly then head straight
    // to My Quizzes — no manual "Back to Dashboard" click needed.
    useEffect(() => {
        if (!result) return;
        const t = setTimeout(() => {
            navigate('/student', { state: { initialTab: 'My Quizzes' } });
        }, 1800);
        return () => clearTimeout(t);
    }, [result, navigate]);

    // --- Fullscreen enforcement ---
    // Quizinstructions.jsx requests fullscreen right before navigating here.
    // If the student exits it (Esc, F11, etc.) we don't just let them keep
    // going — we blur the quiz content behind a warning overlay and count
    // it as a violation, which now actually gets sent to the backend
    // (previously this was hardcoded to 0 on submit).
    const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
    const [fullscreenExitCount, setFullscreenExitCount] = useState(0);

    useEffect(() => {
        function handleFullscreenChange() {
            const active = !!document.fullscreenElement;
            setIsFullscreen(active);
            if (!active) {
                setFullscreenExitCount((v) => v + 1);
            }
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    function reenterFullscreen() {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    }

    // --- Tab-switch detection ---
    // Separate from fullscreen: pressing Alt+Tab, switching browser tabs, or
    // minimizing doesn't reliably trigger fullscreenchange in every browser,
    // but it always triggers the Page Visibility API. We only count a switch
    // once the student RETURNS (we can't show anything while they're gone) —
    // 3 switches are tolerated with a warning, the 4th auto-submits.
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [showTabWarning, setShowTabWarning] = useState(false);
    const wasHiddenRef = useRef(false);

    useEffect(() => {
        function handleVisibilityChange() {
            if (document.hidden) {
                wasHiddenRef.current = true;
            } else if (wasHiddenRef.current) {
                wasHiddenRef.current = false;
                setTabSwitchCount((v) => v + 1);
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // React to each completed tab switch: warn for the first 2, and force-submit
    // with zero marks the moment the count reaches MAX_TAB_SWITCHES (the 3rd).
    useEffect(() => {
        if (tabSwitchCount === 0 || result || submitting) return;
        if (tabSwitchCount >= MAX_TAB_SWITCHES) {
            handleSubmit(true, 'tab_switch');
        } else {
            setShowTabWarning(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabSwitchCount]);

    // Entry point for every ending: the Finish button, the time-up effect,
    // and the tab-switch effect all call this exactly like before.
    function handleSubmit(auto = false, terminationReason = null) {
        if (submitting || showCodeModal) return;

        // Drop out of fullscreen right away so whatever comes next (the code
        // popup, or the result) appears in normal windowed mode.
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }

        if (terminationReason === 'tab_switch') {
            // Unchanged from before this feature existed: no code needed,
            // scores 0 immediately.
            performSubmit(auto, terminationReason, '');
            return;
        }

        // Manual Finish or the timer running out: ask for the completion
        // code before actually submitting.
        pendingSubmissionRef.current = { auto, terminationReason };
        setEnteredCode('');
        setCodeAttemptsLeft(3);
        setCodeError('');
        setShowCodeModal(true);
    }

    // Called when the student confirms the code popup. Unlike before, this no
    // longer submits the quiz on the first try — it checks the code against
    // a lightweight verify endpoint first, and only lets a WRONG code through
    // to the real submission (which scores 0) after 3 failed tries. A correct
    // code always submits immediately. The backend's submitAttempt endpoint
    // still re-checks the code itself, so this is just a friendlier retry UX,
    // not a security boundary.
    async function confirmCodeAndSubmit() {
        const pending = pendingSubmissionRef.current || { auto: true, terminationReason: null };
        const typedCode = enteredCode.trim();

        setVerifyingCode(true);
        setCodeError('');

        let valid = false;
        try {
            const token = localStorage.getItem('quiz_token');
            const res = await fetch(`${API_BASE}/settings/submission-code/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ code: typedCode }),
            });
            const data = await res.json();
            valid = !!data.valid;
        } catch (err) {
            valid = false; // couldn't reach the verify endpoint — treat this as a failed try
        }

        setVerifyingCode(false);

        if (valid) {
            setShowCodeModal(false);
            performSubmit(pending.auto, pending.terminationReason, typedCode);
            return;
        }

        const remaining = codeAttemptsLeft - 1;
        setCodeAttemptsLeft(remaining);

        if (remaining > 0) {
            // Still have tries left — keep the popup open so they can try again.
            setCodeError(`Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`);
            setEnteredCode('');
            return;
        }

        // Out of attempts — submit for real with the (still wrong) code so the
        // backend scores it 0 and tags it 'code_mismatch', exactly as before.
        setShowCodeModal(false);
        performSubmit(pending.auto, pending.terminationReason, typedCode);
    }

    async function performSubmit(auto, terminationReason, code) {
        if (submitting) return;
        setSubmitting(true);
        setSubmitError('');

        const totalSeconds = (quiz.durationMinutes || 15) * 60;
        const timeTakenSeconds = totalSeconds - timeLeft;
        const totalViolations = fullscreenExitCount + tabSwitchCount;

        try {
            const token = localStorage.getItem('quiz_token');
            const res = await fetch(`${API_BASE}/quizzes/${id}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    answers,
                    violationCount: totalViolations,
                    autoSubmitted: auto,
                    timeTakenSeconds,
                    terminationReason,
                    code,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setSubmitError(data.error || 'Failed to submit your quiz.');
                setSubmitting(false);
                return;
            }
            // Backend has already scored it (and zeroed it out for a tab-switch
            // termination) and saved the attempt — this quiz is now "completed".
            setResult({
                score: data.score,
                total: data.total,
                autoSubmitted: data.autoSubmitted,
                terminationReason: data.terminationReason,
            });
        } catch (err) {
            setSubmitError('Could not reach the server to submit your quiz.');
            setSubmitting(false);
        }
    }

    if (loading) return <div className="quiz-page-outer"><div className="quiz-card"><h2>Loading...</h2></div></div>;
    if (!quiz) return <div className="quiz-page-outer"><div className="quiz-card"><h2>Quiz not found.</h2></div></div>;

    // Shown once the backend has scored the attempt and saved it as completed
    if (result) {
        return (
            <div className="quiz-result-overlay">
                <div className="quiz-result-popup">
                    <div className="quiz-result-score">{result.score}/{result.total}</div>
                    <p className="quiz-result-note">
                        {result.terminationReason === 'tab_switch'
                            ? 'Submitted due to tab switch'
                            : result.terminationReason === 'time_up'
                            ? "Time's up — auto-submitted"
                            : result.terminationReason === 'code_mismatch'
                            ? 'Completion code missing or incorrect — scored 0'
                            : result.autoSubmitted
                            ? 'Auto-submitted'
                            : 'Quiz submitted'}
                    </p>
                </div>
            </div>
        );
    }

    const currentQ = quiz.questions[currentIndex];
    const isLast = currentIndex === quiz.questions.length - 1;
    const totalSeconds = (quiz.durationMinutes || 15) * 60;
    const minutesLeft = Math.floor(timeLeft / 60);
    const secondsLeft = timeLeft % 60;

    return (
        <div className={`quiz-page-outer ${(!isFullscreen || showTabWarning || showCodeModal) ? 'is-blurred' : ''}`}>
            <div
                className="quiz-card"
                onContextMenu={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()}
            >
                <div className="quiz-timer-row">
                    <TimerRing value={minutesLeft} max={Math.ceil(totalSeconds / 60)} label="Minutes" />
                    <TimerRing value={secondsLeft} max={60} label="Seconds" />
                </div>

                <div className="quiz-info-box">
                    <div className="quiz-info-col">
                        <p><span className="label">Name :</span> {user.name || '—'}</p>
                        <p><span className="label">Company :</span> Glaxit</p>
                    </div>
                    <div className="quiz-info-col">
                        <p><span className="label">Title :</span> {quiz.title}</p>
                        <p><span className="label">Domain :</span> {quiz.domain || '—'}</p>
                    </div>
                </div>

                <div className="quiz-body">
                    <p className="quiz-progress">Question {currentIndex + 1} of {quiz.questions.length}</p>

                    <h2 className="quiz-question">
                        {currentIndex + 1}. {currentQ.text}
                    </h2>

                    <div className="options-grid">
                        {currentQ.options.map((opt, idx) => (
                            <button
                                key={idx}
                                className={`option-btn ${answers[currentQ.id] === idx ? 'selected' : ''}`}
                                onClick={() => setAnswers(prev => ({ ...prev, [currentQ.id]: idx }))}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="quiz-footer">
                    <button
                        className="nav-btn nav-btn-secondary"
                        disabled={currentIndex === 0}
                        onClick={() => setCurrentIndex(p => p - 1)}
                    >
                        Previous
                    </button>
                    <button
                        className="nav-btn nav-btn-primary"
                        disabled={submitting}
                        onClick={() => (isLast ? handleSubmit() : setCurrentIndex(p => p + 1))}
                    >
                        {submitting ? 'Submitting...' : isLast ? 'Finish' : 'Next'}
                    </button>
                </div>

                {submitError && <p className="submit-error">{submitError}</p>}
            </div>

            {!isFullscreen && (
                <div className="fullscreen-warning-overlay">
                    <div className="fullscreen-warning-box">
                        <div className="fullscreen-warning-icon">!</div>
                        <h2>You've left fullscreen mode</h2>
                        <p>
                            This quiz must be taken in fullscreen. Your progress is safe, but this
                            has been logged as a violation{fullscreenExitCount > 1 ? ` (${fullscreenExitCount} so far)` : ''}.
                        </p>
                        <button className="nav-btn nav-btn-primary" onClick={reenterFullscreen}>
                            Go to Full Screen
                        </button>
                    </div>
                </div>
            )}

            {showTabWarning && (
                <div className="fullscreen-warning-overlay">
                    <div className="fullscreen-warning-box">
                        <div className="fullscreen-warning-icon">!</div>
                        <h2>Tab switch detected</h2>
                        <p>
                            Switching away from this tab counts as a violation. You have{' '}
                            <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                                {MAX_TAB_SWITCHES - tabSwitchCount}
                            </span>{' '}
                            warning{MAX_TAB_SWITCHES - tabSwitchCount === 1 ? '' : 's'} remaining. One more switch will
                            submit your quiz with a score of 0.
                        </p>
                        <button className="nav-btn nav-btn-primary" onClick={() => setShowTabWarning(false)}>
                            I Understand, Continue
                        </button>
                    </div>
                </div>
            )}

            {showCodeModal && (
                <div className="fullscreen-warning-overlay">
                    <div className="fullscreen-warning-box">
                        <div className="fullscreen-warning-icon">!</div>
                        <h2>Enter completion code</h2>
                        <p>
                            Ask your instructor/proctor for today's completion code and enter it below to submit
                            your quiz. You have {codeAttemptsLeft} attempt{codeAttemptsLeft === 1 ? '' : 's'} left —
                            after that your quiz submits automatically with a score of 0.
                        </p>
                        <input
                            type="text"
                            autoFocus
                            value={enteredCode}
                            onChange={(e) => setEnteredCode(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmCodeAndSubmit(); }}
                            placeholder="Completion code"
                            style={{
                                width: '100%', boxSizing: 'border-box', padding: '12px', marginTop: '4px', marginBottom: '8px',
                                borderRadius: '8px', border: codeError ? '1px solid #e74c3c' : '1px solid #ddd',
                                fontSize: '1rem', textAlign: 'center',
                            }}
                        />
                        {codeError && (
                            <p style={{ color: '#e74c3c', fontSize: '13px', margin: '0 0 12px' }}>{codeError}</p>
                        )}
                        <button
                            className="nav-btn nav-btn-primary"
                            disabled={submitting || verifyingCode}
                            onClick={confirmCodeAndSubmit}
                        >
                            {verifyingCode ? 'Checking...' : submitting ? 'Submitting...' : 'Submit Quiz'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuizPage;