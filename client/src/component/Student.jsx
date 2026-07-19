import React, { useState, useEffect, useRef } from 'react';
import { FaEnvelope, FaGraduationCap, FaChevronDown, FaSignOutAlt, FaBars, FaTimes } from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import "./Student.css";

// In production (Vercel) client + API share the same domain, so '/api' just
// works with no config. Locally, set VITE_API_BASE=http://localhost:3000/api
// in client/.env so the dev server (on a different port) still reaches Express.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function terminationLabel(reason) {
    if (reason === 'tab_switch') return 'Submitted due to tab switch';
    return null;
}

function safeParseUser() {
    try {
        return JSON.parse(localStorage.getItem('quiz_user') || '{}');
    } catch {
        return {};
    }
}

// Splits a date into separate "date" and "time" strings for the stacked
// two-line display in the quizzes table (e.g. "12/2/2026" / "2:30 PM").
function formatDateTimeBlock(value) {
    if (!value) return { datePart: '—', timePart: '' };
    const d = new Date(value);
    if (isNaN(d.getTime())) return { datePart: '—', timePart: '' };
    return {
        datePart: d.toLocaleDateString(),
        timePart: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
}

// "2h 15m" / "45m" / "30s" style countdown for a Pending quiz row.
function formatCountdown(ms) {
    if (ms <= 0) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}
// Drop a file named exactly "profile" (any of these extensions) into
// client/src/assets/ and it will automatically be used as the profile photo.
// If no such file exists, profilePhotoUrl stays null and the initials
// avatar (below) is used instead — no code changes needed either way.
const profileImageModules = import.meta.glob('../assets/profile.{png,jpg,jpeg,webp,gif}', {
    eager: true,
    import: 'default',
});
const profilePhotoUrl = Object.values(profileImageModules)[0] || null;

const InternDashboard = () => {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState(location.state?.initialTab || 'Dashboard');
    const navigate = useNavigate();

    const [quizzes, setQuizzes] = useState([]);
    const [loadingQuizzes, setLoadingQuizzes] = useState(true);
    const [quizError, setQuizError] = useState('');

    const [attempts, setAttempts] = useState([]);
    const [loadingAttempts, setLoadingAttempts] = useState(true);
    const [attemptError, setAttemptError] = useState('');

    // Cross-domain leaderboard rank — computed server-side from every
    // student sharing this student's domain, see GET /quizzes/me/rank
    const [rankInfo, setRankInfo] = useState(null); // { rank, totalStudents, score, domain }
    const [loadingRank, setLoadingRank] = useState(true);

    const user = safeParseUser();

    // --- Profile dropdown (top-right, next to the avatar) ---
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef(null);

    // --- Mobile sidebar (phone screens only) ---
    // On phones the sidebar nav is hidden off-screen by default and slides in
    // as a drawer when the header's menu button is tapped, with a dimmed
    // backdrop behind it. On desktop/tablet this stays permanently visible
    // and none of this state has any visual effect (see the min-width:769px
    // rule in Student.css).
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    function selectTab(tab) {
        setActiveTab(tab);
        setMobileNavOpen(false); // picking a tab closes the drawer on phones
    }

    useEffect(() => {
        function handleClickOutside(e) {
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setProfileOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const initials = (user.name || 'S').trim().charAt(0).toUpperCase();

    // --- Server-synced clock (tamper-proof "now") ---
    // We never trust the browser's system clock for unlocking quizzes —
    // a student could just change their computer's date/time to unlock a
    // quiz early. Instead: fetch the real time from the server once, then
    // track elapsed time using performance.now(), a monotonic timer that
    // is NOT affected by the user changing their system clock (unlike
    // Date.now(), which would jump immediately if the clock is changed).
    const [syncBase, setSyncBase] = useState(null); // { serverTimeMs, perfMark }
    const [, setClockTick] = useState(0); // forces a re-render every second

    async function syncServerClock() {
        try {
            const t0 = performance.now();
            const res = await fetch(`${API_BASE}/time`);
            const data = await res.json();
            const t1 = performance.now();
            // Split the round-trip evenly to roughly account for network latency.
            const perfMark = (t0 + t1) / 2;
            setSyncBase({ serverTimeMs: data.now, perfMark });
        } catch {
            // If the sync fails, we simply don't unlock any pending quiz
            // early — getSyncedNow() below falls back to "unknown" rather
            // than trusting the local clock.
        }
    }

    useEffect(() => {
        syncServerClock();
        const resync = setInterval(syncServerClock, 60000); // re-sync every minute
        const tick = setInterval(() => setClockTick((t) => t + 1), 1000); // repaint every second
        return () => {
            clearInterval(resync);
            clearInterval(tick);
        };
    }, []);

    // Current server-accurate time, or null until the first sync completes.
    function getSyncedNow() {
        if (!syncBase) return null;
        return new Date(syncBase.serverTimeMs + (performance.now() - syncBase.perfMark));
    }

    function authHeaders() {
        const token = localStorage.getItem('quiz_token');
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
    }

    async function fetchQuizzes() {
        setLoadingQuizzes(true);
        setQuizError('');
        try {
            const res = await fetch(`${API_BASE}/quizzes`, { headers: authHeaders() });
            if (res.status === 401 || res.status === 403) {
                navigate('/login');
                return;
            }
            const data = await res.json();
            if (!res.ok) {
                setQuizError(data.error || 'Failed to load quizzes');
                return;
            }
            setQuizzes(Array.isArray(data) ? data : []);
        } catch (err) {
            setQuizError('Could not reach the server');
        } finally {
            setLoadingQuizzes(false);
        }
    }

    async function fetchAttempts() {
        setLoadingAttempts(true);
        setAttemptError('');
        try {
            const res = await fetch(`${API_BASE}/quizzes/me/attempts`, { headers: authHeaders() });
            if (res.status === 401 || res.status === 403) {
                navigate('/login');
                return;
            }
            const data = await res.json();
            if (!res.ok) {
                setAttemptError(data.error || 'Failed to load your quiz history');
                return;
            }
            setAttempts(Array.isArray(data) ? data : []);
        } catch (err) {
            setAttemptError('Could not reach the server');
        } finally {
            setLoadingAttempts(false);
        }
    }

    // Rank among peers in the same domain — computed server-side so it stays
    // accurate even as other students take quizzes.
    async function fetchRank() {
        setLoadingRank(true);
        try {
            const res = await fetch(`${API_BASE}/quizzes/me/rank`, { headers: authHeaders() });
            if (res.status === 401 || res.status === 403) {
                navigate('/login');
                return;
            }
            const data = await res.json();
            if (res.ok) {
                setRankInfo(data);
            }
        } catch (err) {
            // Rank is a nice-to-have on the dashboard — fail quietly and
            // just show "—" rather than an error banner.
        } finally {
            setLoadingRank(false);
        }
    }

    useEffect(() => {
        fetchQuizzes();
        fetchAttempts();
        fetchRank();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleLogout() {
        localStorage.removeItem('quiz_token');
        localStorage.removeItem('quiz_user');
        navigate('/login');
    }

    // --- Derived real data (replaces the old mock arrays) ---

    // Oldest -> newest, for chronological charts
    const sortedAttempts = [...attempts].sort(
        (a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)
    );

    const percentFor = (a) => (a.total > 0 ? Math.round((a.score / a.total) * 100) : 0);

    const progressData = sortedAttempts.map((a) => ({
        name: new Date(a.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        score: percentFor(a),
    }));

    const avgScore = sortedAttempts.length
        ? Math.round(sortedAttempts.reduce((sum, a) => sum + percentFor(a), 0) / sortedAttempts.length)
        : null;

    // Real quiz results the student has already completed, from the attempts we fetched
    const attemptedQuizMap = new Map(
        attempts.map((a) => [a.quizId?.toString?.() ?? a.quizId, a])
    );
    // "1m 45s" / "38s" style formatting — more honest for short quizzes than
    // rounding everything down to whole minutes.
    function formatTimeTaken(totalSeconds) {
        const s = Math.round(totalSeconds || 0);
        const m = Math.floor(s / 60);
        const rem = s % 60;
        if (m === 0) return `${rem}s`;
        return `${m}m ${rem}s`;
    }

    const history = [...sortedAttempts].reverse().map((a) => ({
        title: a.quizTitle,
        date: new Date(a.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        score: percentFor(a),
        scoreObtained: a.score,
        scoreTotal: a.total,
        time: Math.round(((a.timeTakenSeconds || 0) / 60) * 10) / 10,
        timeLabel: formatTimeTaken(a.timeTakenSeconds),
        terminationReason: a.terminationReason || null,
    }));

    // "1st" / "2nd" / "3rd" / "4th"... for the Rank card
    function ordinal(n) {
        const rem100 = n % 100;
        if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
        switch (n % 10) {
            case 1: return `${n}st`;
            case 2: return `${n}nd`;
            case 3: return `${n}rd`;
            default: return `${n}th`;
        }
    }

    return (
        <div className="dashboard-container">
            {/* Dimmed backdrop behind the drawer on phones — tapping it closes the menu */}
            {mobileNavOpen && (
                <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />
            )}

            <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
                <div className="sidebar-top-row">
                    <div className="logo">Glaxit Interns</div>
                    <button
                        type="button"
                        className="sidebar-close-btn"
                        onClick={() => setMobileNavOpen(false)}
                        aria-label="Close menu"
                    >
                        <FaTimes />
                    </button>
                </div>
                <nav>
                    <ul>
                        <li className={activeTab === 'Dashboard' ? 'active' : ''} onClick={() => selectTab('Dashboard')}>Dashboard</li>
                        <li className={activeTab === 'My Quizzes' ? 'active' : ''} onClick={() => selectTab('My Quizzes')}>My Quizzes</li>
                        <li className={activeTab === 'Performance' ? 'active' : ''} onClick={() => selectTab('Performance')}>Performance</li>
                        <li onClick={() => setMobileNavOpen(false)}>Certificates</li>
                        <li onClick={handleLogout}>Logout</li>
                    </ul>
                </nav>
            </aside>

            <main className="main-content">
                <header className="top-header">
                    <div className="top-header-left">
                        <button
                            type="button"
                            className="mobile-menu-btn"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="Open menu"
                            aria-expanded={mobileNavOpen}
                        >
                            <FaBars />
                        </button>
                        <h1>{activeTab}</h1>
                    </div>

                    <div className="user-profile-wrap" ref={profileRef}>
                        <button
                            type="button"
                            className={`user-profile ${profileOpen ? 'open' : ''}`}
                            onClick={() => setProfileOpen((p) => !p)}
                            aria-expanded={profileOpen}
                        >
                            <span className="profile-avatar">
                                {profilePhotoUrl ? (
                                    <img src={profilePhotoUrl} alt="Profile" className="profile-avatar-img" />
                                ) : (
                                    initials
                                )}
                            </span>
                            <span className="profile-name">{user.name || 'Student'}</span>
                            <FaChevronDown className="profile-chevron" />
                        </button>

                        {profileOpen && (
                            <div className="profile-dropdown">
                                <div className="profile-dropdown-header">
                                    <span className="profile-avatar profile-avatar-lg">
                                        {profilePhotoUrl ? (
                                            <img src={profilePhotoUrl} alt="Profile" className="profile-avatar-img" />
                                        ) : (
                                            initials
                                        )}
                                    </span>
                                    <div>
                                        <p className="profile-dropdown-name">{user.name || 'Student'}</p>
                                        <p className="profile-dropdown-role">Student</p>
                                    </div>
                                </div>

                                <div className="profile-dropdown-body">
                                    <div className="profile-dropdown-row">
                                        <FaEnvelope className="profile-dropdown-icon" />
                                        <span>{user.email || '—'}</span>
                                    </div>
                                    <div className="profile-dropdown-row">
                                        <FaGraduationCap className="profile-dropdown-icon" />
                                        <span>{user.domain || 'No domain set'}</span>
                                    </div>
                                </div>

                                <button className="profile-dropdown-logout" onClick={handleLogout}>
                                    <FaSignOutAlt /> Logout
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                {/* Dashboard Tab */}
                {activeTab === 'Dashboard' && (
                    <>
                        <section className="stats-grid">
                            <div className="card"><h3>Upcoming Quizzes</h3><p className="big-num">{loadingQuizzes ? '...' : quizzes.length}</p></div>
                            <div className="card">
                                <h3>Avg. Score</h3>
                                <p className="big-num">{loadingAttempts ? '...' : avgScore === null ? '—' : `${avgScore}%`}</p>
                            </div>
                            <div className="card highlight">
                                <h3>Rank</h3>
                                <p className="big-num">
                                    {loadingRank
                                        ? '...'
                                        : rankInfo?.rank
                                            ? ordinal(rankInfo.rank)
                                            : '—'}
                                </p>
                                {!loadingRank && rankInfo?.rank && (
                                    <p className="rank-subtext">
                                        of {rankInfo.totalStudents} in {rankInfo.domain}
                                    </p>
                                )}
                            </div>
                        </section>
                        <section className="charts-container">
                            <div className="chart-card">
                                <h3>Weekly Progress</h3>
                                {loadingAttempts ? (
                                    <p>Loading...</p>
                                ) : progressData.length === 0 ? (
                                    <p>No quiz attempts yet — take a quiz to see your progress here.</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={200}>
                                        <LineChart data={progressData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip />
                                            <Line type="monotone" dataKey="score" stroke="#6c5ce7" strokeWidth={3} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </section>
                    </>
                )}

                {/* Quizzes Tab — real data from MongoDB */}
                {activeTab === 'My Quizzes' && (
                    <section className="data-table">
                        <h2>Available Quizzes</h2>
                        {loadingQuizzes ? (
                            <p>Loading quizzes...</p>
                        ) : quizError ? (
                            <p style={{ color: 'red' }}>{quizError}</p>
                        ) : quizzes.length === 0 ? (
                            <p>No quizzes available right now. Check back later!</p>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Quiz Title</th>
                                        <th>Domain</th>
                                        <th>Starting Time</th>
                                        <th>Ending Time</th>
                                        <th>Start</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quizzes.map(q => {
                                        const attempt = attemptedQuizMap.get(q._id?.toString?.() ?? q._id);
                                        const start = formatDateTimeBlock(q.startAt);
                                        const end = formatDateTimeBlock(q.endAt);

                                        const syncedNow = getSyncedNow();
                                        const startAt = q.startAt ? new Date(q.startAt) : null;
                                        const endAt = q.endAt ? new Date(q.endAt) : null;
                                        // Until the clock has synced with the server at least once, or if a
                                        // quiz has no schedule set, don't block/unblock based on a guess —
                                        // treat it as available (same as the old behavior).
                                        const notYetOpen = syncedNow && startAt && syncedNow < startAt;
                                        const alreadyClosed = syncedNow && endAt && syncedNow > endAt;

                                        return (
                                            <tr key={q._id}>
                                                <td>{q.title}</td>
                                                <td>{q.domain || '—'}</td>
                                                <td>
                                                    <div className="dt-cell">
                                                        <span className="dt-date">{start.datePart}</span>
                                                        {start.timePart && <span className="dt-time">{start.timePart}</span>}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="dt-cell">
                                                        <span className="dt-date">{end.datePart}</span>
                                                        {end.timePart && <span className="dt-time">{end.timePart}</span>}
                                                    </div>
                                                </td>
                                                <td>
                                                    {attempt ? (
                                                        terminationLabel(attempt.terminationReason) ? (
                                                            <span className="badge-missed" title={terminationLabel(attempt.terminationReason)}>
                                                                {terminationLabel(attempt.terminationReason)}
                                                            </span>
                                                        ) : (
                                                            <span className="badge-completed">{attempt.score}/{attempt.total}</span>
                                                        )
                                                    ) : notYetOpen ? (
                                                        <span className="badge-pending" title={`Opens ${start.datePart} ${start.timePart}`}>
                                                            Pending{formatCountdown(startAt - syncedNow) && ` · ${formatCountdown(startAt - syncedNow)}`}
                                                        </span>
                                                    ) : alreadyClosed ? (
                                                        <span className="badge-missed">Missed</span>
                                                    ) : (
                                                        <button className="btn-start" onClick={() => navigate(`/quiz/${q._id}`)}>Start</button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </section>
                )}

                {/* Performance Tab — real data from MongoDB */}
                {activeTab === 'Performance' && (
                    <div className="performance-container">
                        <section className="data-table">
                            <h2>Quiz History</h2>
                            {loadingAttempts ? (
                                <p>Loading history...</p>
                            ) : attemptError ? (
                                <p style={{ color: 'red' }}>{attemptError}</p>
                            ) : history.length === 0 ? (
                                <p>No quiz attempts yet — take a quiz to see your history here.</p>
                            ) : (
                                <table>
                                    <thead><tr><th>Title</th><th>Date</th><th>Marks</th><th>Time Taken</th></tr></thead>
                                    <tbody>{history.map((h, i) => (
                                        <tr key={i}>
                                            <td>{h.title}</td>
                                            <td>{h.date}</td>
                                            <td>
                                                {terminationLabel(h.terminationReason) ? (
                                                    <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                                                        {terminationLabel(h.terminationReason)}
                                                    </span>
                                                ) : (
                                                    <>
                                                        {h.scoreObtained}/{h.scoreTotal}{' '}
                                                        <span style={{ color: '#888', fontSize: '0.8rem' }}>({h.score}%)</span>
                                                    </>
                                                )}
                                            </td>
                                            <td>{h.timeLabel}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            )}
                        </section>
                        {history.length > 0 && (
                            <section className="charts-container" style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div className="chart-card"><h3>Score Trend</h3><ResponsiveContainer width="100%" height={200}><LineChart data={[...history].reverse()}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="title" /><YAxis /><Tooltip /><Line dataKey="score" stroke="#6c5ce7" /></LineChart></ResponsiveContainer></div>
                                <div className="chart-card"><h3>Time Efficiency</h3><ResponsiveContainer width="100%" height={200}><BarChart data={[...history].reverse()}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="title" /><YAxis /><Tooltip /><Bar dataKey="time" fill="#00b894" /></BarChart></ResponsiveContainer></div>
                            </section>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default InternDashboard;