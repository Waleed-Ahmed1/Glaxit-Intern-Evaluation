import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
    const [quiz, setQuiz] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState({});

    // Real countdown, seeded from the quiz's own durationMinutes (from the backend)
    const [timeLeft, setTimeLeft] = useState(0);

    // Read-only display value, same localStorage read used elsewhere in the app
    const user = JSON.parse(localStorage.getItem('quiz_user') || '{}');

    useEffect(() => {
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
    }, [id]);

    // Tick every second once the quiz (and its real duration) has loaded
    useEffect(() => {
        if (!quiz || timeLeft <= 0) return;
        const timer = setInterval(() => setTimeLeft((prev) => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(timer);
    }, [quiz, timeLeft]);

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [result, setResult] = useState(null); // { score, total } once the backend confirms it

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

    async function handleSubmit(auto = false, terminationReason = null) {
        if (submitting) return;
        setSubmitting(true);
        setSubmitError('');

        // Drop out of fullscreen right away so the result popup appears in
        // normal windowed mode instead of staying stuck behind fullscreen.
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }

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
        <div className={`quiz-page-outer ${(!isFullscreen || showTabWarning) ? 'is-blurred' : ''}`}>
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
        </div>
    );
};

export default QuizPage;