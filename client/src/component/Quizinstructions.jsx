import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FaBriefcase, FaClock, FaQuestionCircle, FaTrophy, FaCalendarAlt, FaExclamationTriangle } from 'react-icons/fa';
import "./Quizinstructions.css";

// In production (Vercel) client + API share the same domain, so '/api' just
// works with no config. Locally, set VITE_API_BASE=http://localhost:3000/api
// in client/.env so the dev server (on a different port) still reaches Express.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function authHeaders() {
    const token = localStorage.getItem('quiz_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

function formatScheduled(value) {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

const QuizInstructions = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [quiz, setQuiz] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    // Only reached properly by clicking "Start" on the dashboard, which sets
    // this flag via navigate(..., { state: { fromDashboard: true } }). A
    // pasted/bookmarked/shared link, or a fresh tab, arrives with no state
    // at all — that's exactly how we tell the two apart, since router state
    // isn't part of the URL. (A page refresh keeps it, since the browser
    // preserves history state across a reload in the same tab — so an
    // in-progress flow surviving a refresh is expected, not a loophole.)
    const cameFromDashboard = !!location.state?.fromDashboard;

    useEffect(() => {
        if (!cameFromDashboard) {
            setLoading(false);
            return;
        }
        async function fetchQuiz() {
            try {
                const res = await fetch(`${API_BASE}/quizzes/${id}`, { headers: authHeaders() });
                const data = await res.json();
                if (!res.ok) {
                    setLoadError(data.error || 'Could not load this quiz.');
                } else {
                    setQuiz(data);
                }
            } catch {
                setLoadError('Could not reach the server.');
            } finally {
                setLoading(false);
            }
        }
        fetchQuiz();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, cameFromDashboard]);

    function handleStart() {
        // Attempt fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(console.error);
        }
        // Same flag, carried forward — QuizPage checks for this the same way.
        navigate(`/quiz/${id}/take`, { state: { fromInstructions: true } });
    }

    if (!cameFromDashboard) {
        return (
            <div className="instructions-container">
                <div className="instructions-card">
                    <h1>Quiz unavailable</h1>
                    <p>Quizzes can only be started from your dashboard — please open this quiz by clicking "Start" there.</p>
                    <button className="btn-back" onClick={() => navigate('/student')}>
                        &larr; Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="instructions-container">
                <div className="instructions-card">
                    <h1>Loading quiz...</h1>
                </div>
            </div>
        );
    }

    if (loadError || !quiz) {
        return (
            <div className="instructions-container">
                <div className="instructions-card">
                    <h1>Quiz unavailable</h1>
                    <p>{loadError || 'This quiz could not be found.'}</p>
                    <button className="btn-back" onClick={() => navigate('/student')}>
                        &larr; Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="instructions-container">
            <div className="instructions-card">
                <div className="instructions-eyebrow">Quiz Instructions</div>
                <h1>{quiz.title}</h1>

                <div className="quiz-meta">
                    <span className="meta-chip">
                        <FaBriefcase className="meta-chip-icon" /> {quiz.domain || 'General'}
                    </span>
                    <span className="meta-chip">
                        <FaClock className="meta-chip-icon" /> {quiz.durationMinutes || 15} min
                    </span>
                    <span className="meta-chip">
                        <FaQuestionCircle className="meta-chip-icon" /> {quiz.questions?.length || 0} question{(quiz.questions?.length || 0) !== 1 ? 's' : ''}
                    </span>
                    {typeof quiz.totalPoints === 'number' && (
                        <span className="meta-chip">
                            <FaTrophy className="meta-chip-icon" /> {quiz.totalPoints} point{quiz.totalPoints !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {formatScheduled(quiz.startAt) && (
                    <div className="quiz-schedule">
                        <FaCalendarAlt className="meta-chip-icon" />
                        <span>Available {formatScheduled(quiz.startAt)}{formatScheduled(quiz.endAt) ? ` – ${formatScheduled(quiz.endAt)}` : ''}</span>
                    </div>
                )}

                <div className="instructions-badge">
                    <FaExclamationTriangle /> Instructions
                </div>
                <ul className="instructions-list">
                    <li>Once started, <strong className="instr-warn">the timer cannot be paused</strong> — make sure you have {quiz.durationMinutes || 15} uninterrupted minutes.</li>
                    <li>The quiz will open in fullscreen mode. <strong className="instr-warn">Avoid switching tabs or exiting fullscreen.</strong></li>
                    <li>You can move between questions using Previous / Next before submitting.</li>
                    <li><strong className="instr-warn">Submitting is final</strong> — you won't be able to retake this quiz once it's finished.</li>
                    <li>Make sure you have a stable internet connection before starting.</li>
                </ul>

                <div className="instructions-actions">
                    <button className="btn-start-quiz" onClick={handleStart}>
                        Start Quiz
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuizInstructions;