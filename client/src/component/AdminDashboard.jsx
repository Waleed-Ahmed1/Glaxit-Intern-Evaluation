import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { FaSearch, FaDownload, FaPlus, FaFileUpload, FaRobot, FaBars, FaTimes } from "react-icons/fa";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import "./admin.css";
import { DOMAINS } from "../constants/domains";

// In production (Vercel) client + API share the same domain, so '/api' just
// works with no config. Locally, set VITE_API_BASE=http://localhost:3000/api
// in client/.env so the dev server (on a different port) still reaches Express.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function terminationLabel(reason) {
    if (reason === 'tab_switch') return 'Submitted due to tab switch';
    if (reason === 'time_up') return 'Time expired — auto-submitted';
    return null;
}

const AdminDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('Overview');
    const [searchTerm, setSearchTerm] = useState('');

    const [isCreating, setIsCreating] = useState(false);
    const [quizzes, setQuizzes] = useState([]);
    const [loadingQuizzes, setLoadingQuizzes] = useState(true);
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);

    const [quizDetails, setQuizDetails] = useState({ title: '', domain: '', date: '', startTime: '', endTime: '' });
    const [questions, setQuestions] = useState([
        { text: '', options: ['', '', '', ''], correctIndex: 0, points: 1 },
    ]);

    const [fileError, setFileError] = useState('');
    const [fileSuccess, setFileSuccess] = useState('');
    const [attemptedSave, setAttemptedSave] = useState(false);

    const [aiTask, setAiTask] = useState('');
    const [aiNumQuestions, setAiNumQuestions] = useState(10);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiSuccess, setAiSuccess] = useState('');

    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(true);
    const [domainFilter, setDomainFilter] = useState('All');

    // "View" dialog for a single student
    const [viewingStudent, setViewingStudent] = useState(null); // student object or null
    const [studentAttempts, setStudentAttempts] = useState([]);
    const [loadingStudentAttempts, setLoadingStudentAttempts] = useState(false);
    const [studentAttemptsError, setStudentAttemptsError] = useState('');

    // Placeholder until quiz attempts/scoring is built (Phase 5)
    const passStudentsCount = 0;

    // Real per-domain performance, computed server-side from actual quiz
    // attempts — see GET /quizzes/domain-stats. Replaces the old hardcoded
    // sample array.
    const [domainStats, setDomainStats] = useState([]);
    const [loadingDomainStats, setLoadingDomainStats] = useState(true);
    const [domainStatsError, setDomainStatsError] = useState('');

    // Phone-only sidebar drawer, same pattern as the Student dashboard.
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    // Drives the Overview chart's height/margins — recharts needs an actual
    // pixel height passed in JS, CSS media queries alone can't shrink it,
    // so we track viewport width directly.
    const [isNarrowScreen, setIsNarrowScreen] = useState(
        () => typeof window !== 'undefined' && window.innerWidth <= 768
    );

    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        function handleResize() {
            setIsNarrowScreen(window.innerWidth <= 768);
        }
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    function authHeaders() {
        const token = localStorage.getItem('quiz_token');
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
    }

    async function fetchQuizzes() {
        setLoadingQuizzes(true);
        try {
            const res = await fetch(`${API_BASE}/quizzes`, { headers: authHeaders() });
            if (res.status === 401 || res.status === 403) {
                navigate('/login');
                return;
            }
            const data = await res.json();
            setQuizzes(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load quizzes:', err);
        } finally {
            setLoadingQuizzes(false);
        }
    }

    async function handleExport() {
        setExporting(true);
        try {
            const res = await fetch(`${API_BASE}/quizzes/export.xlsx`, { headers: authHeaders() });
            if (res.status === 401 || res.status === 403) {
                navigate('/login');
                return;
            }
            if (!res.ok) {
                let message = 'Failed to prepare the export';
                try {
                    const data = await res.json();
                    message = data.error || message;
                } catch {
                    // response wasn't JSON (e.g. a raw 500 page) — keep the default message
                }
                alert(message);
                return;
            }

            // The server sends the finished .xlsx file directly — just save it.
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const dateStamp = new Date().toISOString().slice(0, 10);
            const link = document.createElement('a');
            link.href = url;
            link.download = `glaxit-export-${dateStamp}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            alert('Could not reach the server to prepare the export');
        } finally {
            setExporting(false);
        }
    }

    async function fetchDomainStats() {
        setLoadingDomainStats(true);
        setDomainStatsError('');
        try {
            const res = await fetch(`${API_BASE}/quizzes/domain-stats`, { headers: authHeaders() });
            if (res.status === 401 || res.status === 403) {
                navigate('/login');
                return;
            }
            const data = await res.json();
            if (!res.ok) {
                setDomainStatsError(data.error || 'Failed to load performance data');
                return;
            }
            setDomainStats(Array.isArray(data) ? data : []);
        } catch (err) {
            setDomainStatsError('Could not reach the server');
        } finally {
            setLoadingDomainStats(false);
        }
    }

    async function fetchStudents() {
        setLoadingStudents(true);
        try {
            const res = await fetch(`${API_BASE}/users?role=student`, { headers: authHeaders() });
            if (res.status === 401 || res.status === 403) {
                navigate('/login');
                return;
            }
            const data = await res.json();
            setStudents(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load students:', err);
        } finally {
            setLoadingStudents(false);
        }
    }

    async function openStudentView(student) {
        setViewingStudent(student);
        setStudentAttempts([]);
        setStudentAttemptsError('');
        setLoadingStudentAttempts(true);
        try {
            const res = await fetch(`${API_BASE}/quizzes/students/${student._id}/attempts`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) {
                setStudentAttemptsError(data.error || "Could not load this student's quiz history.");
            } else {
                setStudentAttempts(Array.isArray(data) ? data : []);
            }
        } catch {
            setStudentAttemptsError('Could not reach the server.');
        } finally {
            setLoadingStudentAttempts(false);
        }
    }

    function closeStudentView() {
        setViewingStudent(null);
        setStudentAttempts([]);
        setStudentAttemptsError('');
    }

    useEffect(() => {
        fetchQuizzes();
        fetchStudents();
        fetchDomainStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addQuestion = () =>
        setQuestions([...questions, { text: '', options: ['', '', '', ''], correctIndex: 0, points: 1 }]);

    const removeQuestion = (idx) => setQuestions(questions.filter((_, i) => i !== idx));

    function updateQuestionText(qIndex, value) {
        const copy = [...questions];
        copy[qIndex].text = value;
        setQuestions(copy);
    }

    function updateOption(qIndex, oIndex, value) {
        const copy = [...questions];
        copy[qIndex].options[oIndex] = value;
        setQuestions(copy);
    }

    function updateCorrectIndex(qIndex, oIndex) {
        const copy = [...questions];
        copy[qIndex].correctIndex = oIndex;
        setQuestions(copy);
    }

    function updatePoints(qIndex, value) {
        const copy = [...questions];
        copy[qIndex].points = Number(value) || 1;
        setQuestions(copy);
    }

    // Combines the date + start/end time inputs into real Date objects and
    // the derived duration. Returns an error string when anything is
    // missing/invalid so both the live preview and saveQuiz() can share it.
    function getScheduleInfo({ date, startTime, endTime }) {
        if (!date || !startTime || !endTime) {
            return { error: 'Date, start time, and end time are all required' };
        }
        const startAt = new Date(`${date}T${startTime}`);
        const endAt = new Date(`${date}T${endTime}`);
        if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
            return { error: 'Invalid date/time' };
        }
        const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
        if (durationMinutes <= 0) {
            return { error: 'End time must be after start time' };
        }
        return { startAt, endAt, durationMinutes, error: null };
    }

    function resetForm() {
        setQuizDetails({ title: '', domain: '', date: '', startTime: '', endTime: '' });
        setQuestions([{ text: '', options: ['', '', '', ''], correctIndex: 0, points: 1 }]);
        setSaveError('');
        setFileError('');
        setFileSuccess('');
        setAttemptedSave(false);
    }

    // ---------- BULK-LOAD QUESTIONS FROM A JSON FILE ----------
    // Expected shape: an array of objects like
    // { text, options: [4 strings], correctIndex? (0-3), points? }
    // correctIndex/points are optional — default to 0 / 1 and can still be
    // adjusted manually afterward using the normal form controls.
    function handleQuestionsFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        setFileError('');
        setFileSuccess('');

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);

                if (!Array.isArray(parsed) || parsed.length === 0) {
                    setFileError('File must contain a JSON array of questions');
                    return;
                }

                const normalized = parsed.map((q, i) => {
                    if (!q.text || typeof q.text !== 'string') {
                        throw new Error(`Question ${i + 1} is missing "text"`);
                    }
                    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !o)) {
                        throw new Error(`Question ${i + 1} needs exactly 4 non-empty "options"`);
                    }
                    const correctIndex =
                        typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
                            ? q.correctIndex
                            : 0;
                    const points = typeof q.points === 'number' && q.points > 0 ? q.points : 1;

                    return { text: q.text, options: q.options, correctIndex, points };
                });

                setQuestions(normalized);
                setFileSuccess(`Loaded ${normalized.length} question${normalized.length > 1 ? 's' : ''} from file. Review the correct answers before saving.`);
            } catch (err) {
                setFileError(err.message || 'Could not parse this file. Make sure it is valid JSON.');
            }
        };
        reader.onerror = () => setFileError('Failed to read the file');
        reader.readAsText(file);

        // Allow re-uploading the same filename later by resetting the input
        e.target.value = '';
    }

    // ---------- GENERATE QUESTIONS WITH AI (Groq) ----------
    async function handleGenerateWithAI() {
        setAiError('');
        setAiSuccess('');

        if (!aiTask.trim()) {
            setAiError('Paste the student task / topic description first');
            return;
        }

        setAiLoading(true);
        try {
            const res = await fetch(`${API_BASE}/ai/generate-quiz`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    task: aiTask,
                    domain: quizDetails.domain,
                    numQuestions: Number(aiNumQuestions) || 10,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setAiError(data.error || 'Failed to generate questions');
                return;
            }

            // Run the AI's questions through the exact same normalization the
            // manual JSON upload uses, rather than trusting them blindly.
            const normalized = data.questions.map((q, i) => {
                if (!q.text || typeof q.text !== 'string') {
                    throw new Error(`Question ${i + 1} is missing "text"`);
                }
                if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !o)) {
                    throw new Error(`Question ${i + 1} needs exactly 4 non-empty "options"`);
                }
                const correctIndex =
                    typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
                        ? q.correctIndex
                        : 0;
                const points = typeof q.points === 'number' && q.points > 0 ? q.points : 1;
                return { text: q.text, options: q.options, correctIndex, points };
            });

            setQuestions(normalized);
            setAiSuccess(`Generated ${normalized.length} question${normalized.length > 1 ? 's' : ''}. Review each one — especially the marked correct answer — before saving.`);
        } catch (err) {
            setAiError(err.message || 'Could not reach the server');
        } finally {
            setAiLoading(false);
        }
    }

    // ---------- DOWNLOAD A SAMPLE JSON FILE ----------
    function downloadSampleFile() {
        const sample = [
            {
                text: "What does HTML stand for?",
                options: ["Hyper Trainer Marking Language", "Hyper Text Markup Language", "Hyper Text Marketing Language", "Hyperlink and Text Markup Language"],
                correctIndex: 1,
                points: 1,
            },
            {
                text: "Which company developed React?",
                options: ["Google", "Microsoft", "Facebook (Meta)", "Amazon"],
                correctIndex: 2,
                points: 2,
            },
        ];

        const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sample-questions.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async function saveQuiz() {
        setSaveError('');
        setAttemptedSave(true);

        if (!quizDetails.title.trim()) {
            setSaveError('Quiz title is required');
            return;
        }
        if (!DOMAINS.includes(quizDetails.domain)) {
            setSaveError('Please select a domain for this quiz');
            return;
        }
        const schedule = getScheduleInfo(quizDetails);
        if (schedule.error) {
            setSaveError(schedule.error);
            return;
        }
        for (const q of questions) {
            if (!q.text.trim() || q.options.some((o) => !o.trim())) {
                setSaveError('Every question needs text and all 4 options filled in');
                return;
            }
        }

        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/quizzes`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    title: quizDetails.title,
                    domain: quizDetails.domain,
                    difficulty: 'Medium',
                    startAt: schedule.startAt.toISOString(),
                    endAt: schedule.endAt.toISOString(),
                    status: 'published',
                    questions: questions.map((q) => ({
                        text: q.text,
                        options: q.options,
                        correctIndex: q.correctIndex,
                        points: q.points,
                    })),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setSaveError(data.error || 'Failed to save quiz');
                return;
            }

            setQuizzes((prev) => [data, ...prev]);
            setIsCreating(false);
            resetForm();
        } catch (err) {
            setSaveError('Could not reach the server');
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteQuiz(id) {
        if (!window.confirm('Delete this quiz? This cannot be undone.')) return;
        try {
            const res = await fetch(`${API_BASE}/quizzes/${id}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (res.ok || res.status === 204) {
                setQuizzes((prev) => prev.filter((q) => q._id !== id));
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    }

    function selectTab(tab) {
        setActiveTab(tab);
        setMobileNavOpen(false); // picking a tab closes the drawer on phones
    }

    const filteredStudents = students.filter((s) => {
        const term = searchTerm.trim().toLowerCase();
        const matchesSearch =
            term === '' ||
            (s.name || '').toLowerCase().includes(term) ||
            (s.email || '').toLowerCase().includes(term) ||
            (s._id || '').toLowerCase().includes(term);
        const matchesDomain = domainFilter === 'All' || s.domain === domainFilter;
        return matchesSearch && matchesDomain;
    });

    return (
        <div className="dashboard-container">
            {/* Dimmed backdrop behind the drawer on phones — tapping it closes the menu */}
            {mobileNavOpen && (
                <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />
            )}

            <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
                <div className="sidebar-top-row">
                    <div className="logo">Admin Panel</div>
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
                        <li className={activeTab === 'Overview' ? 'active' : ''} onClick={() => selectTab('Overview')}>Overview</li>
                        <li className={activeTab === 'Interns' ? 'active' : ''} onClick={() => selectTab('Interns')}>Interns</li>
                        <li className={activeTab === 'Management' ? 'active' : ''} onClick={() => selectTab('Management')}>Management</li>
                        <li onClick={() => { localStorage.removeItem('quiz_token'); localStorage.removeItem('quiz_user'); navigate('/login'); }}>Logout</li>
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
                    {activeTab === 'Interns' && (
                        <div className="header-controls">
                            <select
                                className="domain-filter-select"
                                value={domainFilter}
                                onChange={(e) => setDomainFilter(e.target.value)}
                            >
                                <option value="All">All Domains</option>
                                {DOMAINS.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            <div className="search-bar">
                                <FaSearch className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search by name or email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button className="btn-export" onClick={handleExport} disabled={exporting}>
                                <FaDownload /> {exporting ? 'Exporting...' : 'Export'}
                            </button>
                        </div>
                    )}
                </header>

                {activeTab === 'Overview' && (
                    <section className="overview-content">
                        <div className="stats-grid">
                            <div className="stat-card">
                                <h3>Total Students</h3>
                                <p>{loadingStudents ? '...' : students.length}</p>
                            </div>
                            <div className="stat-card">
                                <h3>Total Quizzes</h3>
                                <p>{loadingQuizzes ? '...' : quizzes.length}</p>
                            </div>
                            <div className="stat-card">
                                <h3>Pass Students</h3>
                                <p>{passStudentsCount}</p>
                            </div>
                        </div>

                        <div className="chart-card-large">
                            <h3 style={{ marginBottom: '4px' }}>Intern Performance by Domain</h3>
                            <p style={{ fontSize: '12px', color: '#999', marginTop: 0, marginBottom: '20px' }}>
                                Avg score, pass rate, and engagement — computed live from actual quiz attempts
                            </p>
                            {loadingDomainStats ? (
                                <p>Loading performance data...</p>
                            ) : domainStatsError ? (
                                <p style={{ color: 'red' }}>{domainStatsError}</p>
                            ) : domainStats.length === 0 ? (
                                <p>No students or quiz attempts yet — this chart will fill in once interns start taking quizzes.</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={isNarrowScreen ? 240 : 320}>
                                    <LineChart
                                        data={domainStats}
                                        margin={isNarrowScreen
                                            ? { top: 5, right: 8, left: -20, bottom: 5 }
                                            : { top: 5, right: 30, left: 0, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                        <XAxis dataKey="domain" tick={{ fontSize: isNarrowScreen ? 10 : 12 }} interval={0} angle={isNarrowScreen ? -20 : 0} textAnchor={isNarrowScreen ? 'end' : 'middle'} height={isNarrowScreen ? 50 : 30} />
                                        <YAxis tick={{ fontSize: isNarrowScreen ? 10 : 12 }} domain={[0, 100]} width={isNarrowScreen ? 32 : 60} />
                                        <Tooltip />
                                        <Legend wrapperStyle={isNarrowScreen ? { fontSize: '11px' } : undefined} />
                                        <Line type="monotone" dataKey="avgScore" name="Avg Score %" stroke="#6c5ce7" strokeWidth={2.5} dot={{ r: isNarrowScreen ? 3 : 4 }} />
                                        <Line type="monotone" dataKey="passRate" name="Pass Rate %" stroke="#00b894" strokeWidth={2.5} dot={{ r: isNarrowScreen ? 3 : 4 }} />
                                        <Line type="monotone" dataKey="engagement" name="Engagement %" stroke="#e17055" strokeWidth={2.5} dot={{ r: isNarrowScreen ? 3 : 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </section>
                )}

                {activeTab === 'Interns' && (
                    <section className="data-table">
                        {loadingStudents ? (
                            <p>Loading students...</p>
                        ) : filteredStudents.length === 0 ? (
                            <p>No students registered yet.</p>
                        ) : (
                            <>
                                {/* Table — shown on tablet/desktop, hidden on phones */}
                                <div className="table-scroll-wrap">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Name</th>
                                                <th>Email</th>
                                                <th>Joined</th>
                                                <th>Domain</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredStudents.map((s) => (
                                                <tr key={s._id}>
                                                    <td title={s._id}>{s._id.slice(-6)}</td>
                                                    <td>{s.name}</td>
                                                    <td>{s.email}</td>
                                                    <td>{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</td>
                                                    <td>{s.domain || '—'}</td>
                                                    <td><button className="btn-start" onClick={() => openStudentView(s)}>View</button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Card list — shown on phones, hidden on tablet/desktop.
                                    Same pattern as the Student dashboard's My Quizzes tab:
                                    each row becomes its own card with label/value pairs
                                    stacked vertically instead of a squeezed table row. */}
                                <div className="record-cards">
                                    {filteredStudents.map((s) => (
                                        <div className="record-card" key={s._id}>
                                            <div className="record-row">
                                                <span className="record-label">ID</span>
                                                <span className="record-value" title={s._id}>{s._id.slice(-6)}</span>
                                            </div>
                                            <div className="record-row">
                                                <span className="record-label">Name</span>
                                                <span className="record-value">{s.name}</span>
                                            </div>
                                            <div className="record-row">
                                                <span className="record-label">Email</span>
                                                <span className="record-value">{s.email}</span>
                                            </div>
                                            <div className="record-row">
                                                <span className="record-label">Joined</span>
                                                <span className="record-value">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</span>
                                            </div>
                                            <div className="record-row">
                                                <span className="record-label">Domain</span>
                                                <span className="record-value">{s.domain || '—'}</span>
                                            </div>
                                            <div className="record-row">
                                                <span className="record-label">Action</span>
                                                <span className="record-value">
                                                    <button className="btn-start" onClick={() => openStudentView(s)}>View</button>
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>
                )}

                {activeTab === 'Management' && !isCreating && (
                    <>
                        <section className="quiz-builder">
                            <h2>All Quizzes</h2>
                            {loadingQuizzes ? (
                                <p>Loading quizzes...</p>
                            ) : quizzes.length === 0 ? (
                                <p>No quiz uploaded now.</p>
                            ) : (
                                <ul>
                                    {quizzes.map(q => (
                                        <li key={q._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span>
                                                {q.title} ({q.domain || 'No domain'}) — {q.questions?.length || 0} questions, {q.totalPoints} pts
                                                {q.startAt && (
                                                    <> — {new Date(q.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} ({q.durationMinutes} min)</>
                                                )}
                                            </span>
                                            <button
                                                onClick={() => handleDeleteQuiz(q._id)}
                                                style={{ padding: '6px 12px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                                            >
                                                Delete
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <div style={{ maxWidth: '900px', margin: '20px auto 0' }}>
                            <button className="btn-save" onClick={() => setIsCreating(true)}><FaPlus /> Create New Quiz</button>
                        </div>
                    </>
                )}

                {activeTab === 'Management' && isCreating && (
                    <section className="quiz-builder">
                        <h2>Setup Quiz Details</h2>
                        <div className="setup-card">
                            <input
                                className="quiz-input"
                                placeholder="Quiz Title"
                                value={quizDetails.title}
                                onChange={(e) => setQuizDetails({ ...quizDetails, title: e.target.value })}
                            />
                            <select
                                className="quiz-input"
                                value={quizDetails.domain}
                                onChange={(e) => setQuizDetails({ ...quizDetails, domain: e.target.value })}
                                required
                                style={attemptedSave && !quizDetails.domain ? { borderColor: '#e74c3c' } : undefined}
                            >
                                <option value="">Select Domain</option>
                                {DOMAINS.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            {attemptedSave && !quizDetails.domain && (
                                <p style={{ fontSize: '12px', color: '#e74c3c', margin: '-4px 0 8px' }}>
                                    Domain is required to create a quiz
                                </p>
                            )}
                            <input
                                type="date"
                                className="quiz-input"
                                value={quizDetails.date}
                                onChange={(e) => setQuizDetails({ ...quizDetails, date: e.target.value })}
                                required
                                style={attemptedSave && !quizDetails.date ? { borderColor: '#e74c3c' } : undefined}
                            />
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <input
                                    type="time"
                                    className="quiz-input"
                                    placeholder="Start Time"
                                    value={quizDetails.startTime}
                                    onChange={(e) => setQuizDetails({ ...quizDetails, startTime: e.target.value })}
                                    required
                                    style={attemptedSave && !quizDetails.startTime ? { borderColor: '#e74c3c' } : undefined}
                                />
                                <input
                                    type="time"
                                    className="quiz-input"
                                    placeholder="End Time"
                                    value={quizDetails.endTime}
                                    onChange={(e) => setQuizDetails({ ...quizDetails, endTime: e.target.value })}
                                    required
                                    style={attemptedSave && !quizDetails.endTime ? { borderColor: '#e74c3c' } : undefined}
                                />
                            </div>
                            {(() => {
                                const schedule = getScheduleInfo(quizDetails);
                                if (schedule.error) {
                                    return (attemptedSave || quizDetails.date || quizDetails.startTime || quizDetails.endTime) ? (
                                        <p style={{ fontSize: '12px', color: '#e74c3c', margin: '-4px 0 8px' }}>
                                            {schedule.error}
                                        </p>
                                    ) : (
                                        <p style={{ fontSize: '12px', color: '#888', margin: '-4px 0 8px' }}>
                                            Duration is calculated automatically from start and end time
                                        </p>
                                    );
                                }
                                return (
                                    <p style={{ fontSize: '12px', color: '#00b894', margin: '-4px 0 8px' }}>
                                        Duration: {schedule.durationMinutes} minute{schedule.durationMinutes !== 1 ? 's' : ''}
                                    </p>
                                );
                            })()}
                        </div>

                        {/* BULK UPLOAD QUESTIONS FROM JSON */}
                        <div
                            style={{
                                background: '#f9f9ff',
                                border: '1px dashed #6c5ce7',
                                borderRadius: '10px',
                                padding: '16px',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <label
                                htmlFor="question-file-upload"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: '#6c5ce7',
                                    color: '#fff',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                }}
                            >
                                <FaFileUpload /> Upload Questions (JSON)
                            </label>
                            <input
                                id="question-file-upload"
                                type="file"
                                accept=".json,application/json"
                                onChange={handleQuestionsFileUpload}
                                style={{ display: 'none' }}
                            />

                            <button
                                type="button"
                                onClick={downloadSampleFile}
                                style={{
                                    background: 'transparent',
                                    color: '#6c5ce7',
                                    border: '1px solid #6c5ce7',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                }}
                            >
                                Download Sample
                            </button>

                            {fileError && <p style={{ color: 'red', fontSize: '13px', margin: 0, width: '100%' }}>{fileError}</p>}
                            {fileSuccess && <p style={{ color: '#00b894', fontSize: '13px', margin: 0, width: '100%' }}>{fileSuccess}</p>}
                        </div>

                        <div
                            style={{
                                background: '#f7f7fb',
                                border: '1px solid #e4e4ee',
                                borderRadius: '10px',
                                padding: '16px 20px',
                                marginBottom: '20px',
                            }}
                        >
                            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px', margin: '0 0 10px 0', color: '#2d2d2d' }}>
                                <FaRobot /> Generate Questions with AI
                            </p>
                            <textarea
                                className="quiz-input"
                                placeholder="Paste the student task / topic description here (e.g. 'Basics of React hooks: useState, useEffect, and useContext')"
                                value={aiTask}
                                onChange={(e) => setAiTask(e.target.value)}
                                rows={3}
                                style={{ width: '100%', resize: 'vertical', marginBottom: '10px' }}
                            />
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    className="quiz-input"
                                    style={{ maxWidth: '110px' }}
                                    value={aiNumQuestions}
                                    onChange={(e) => setAiNumQuestions(e.target.value)}
                                    title="Number of questions"
                                />
                                <button
                                    type="button"
                                    onClick={handleGenerateWithAI}
                                    disabled={aiLoading}
                                    style={{
                                        background: '#6c5ce7',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        cursor: aiLoading ? 'not-allowed' : 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        opacity: aiLoading ? 0.7 : 1,
                                    }}
                                >
                                    {aiLoading ? 'Generating...' : 'Generate Quiz'}
                                </button>
                                <span style={{ fontSize: '12px', color: '#999' }}>
                                    This replaces the questions below — save the file version first if you want to keep it.
                                </span>
                            </div>
                            {aiError && <p style={{ color: 'red', fontSize: '13px', margin: '10px 0 0 0' }}>{aiError}</p>}
                            {aiSuccess && <p style={{ color: '#00b894', fontSize: '13px', margin: '10px 0 0 0' }}>{aiSuccess}</p>}
                        </div>

                        {questions.map((q, qIndex) => (
                            <div key={qIndex} className="question-card">
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <input
                                        placeholder={`Question ${qIndex + 1}`}
                                        className="quiz-input"
                                        value={q.text}
                                        onChange={(e) => updateQuestionText(qIndex, e.target.value)}
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        className="quiz-input"
                                        style={{ maxWidth: '90px' }}
                                        placeholder="Points"
                                        value={q.points}
                                        onChange={(e) => updatePoints(qIndex, e.target.value)}
                                    />
                                    <button
                                        onClick={() => removeQuestion(qIndex)}
                                        style={{ padding: '10px', background: 'red', color: 'white', border: 'none', borderRadius: '5px' }}
                                    >
                                        X
                                    </button>
                                </div>

                                <p style={{ fontSize: '13px', color: '#888', margin: '10px 0 4px' }}>
                                    Select the radio button next to the correct answer:
                                </p>

                                <div className="options-grid-mini">
                                    {q.options.map((opt, oIndex) => (
                                        <div key={oIndex} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="radio"
                                                name={`correct-${qIndex}`}
                                                checked={q.correctIndex === oIndex}
                                                onChange={() => updateCorrectIndex(qIndex, oIndex)}
                                            />
                                            <input
                                                placeholder={`Option ${oIndex + 1}`}
                                                className="quiz-input"
                                                value={opt}
                                                onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <button className="btn-add" onClick={addQuestion}><FaPlus /> Add Question</button>

                        {saveError && <p style={{ color: 'red', marginTop: '10px' }}>{saveError}</p>}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button
                                className="btn-save"
                                onClick={saveQuiz}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Finish & Save'}
                            </button>
                            <button
                                onClick={() => { setIsCreating(false); resetForm(); }}
                                style={{ padding: '10px 20px', background: '#ccc', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </section>
                )}
            </main>

            {viewingStudent && (
                <div className="modal-overlay" onClick={closeStudentView}>
                    <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{viewingStudent.name}</h2>
                            <button className="modal-close" onClick={closeStudentView}>&times;</button>
                        </div>

                        <div className="modal-details-grid">
                            <div><span className="modal-label">ID</span><span title={viewingStudent._id}>{viewingStudent._id.slice(-6)}</span></div>
                            <div><span className="modal-label">Email</span><span>{viewingStudent.email}</span></div>
                            <div><span className="modal-label">Domain</span><span>{viewingStudent.domain || '—'}</span></div>
                            <div><span className="modal-label">Joined</span><span>{viewingStudent.createdAt ? new Date(viewingStudent.createdAt).toLocaleDateString() : '—'}</span></div>
                        </div>

                        {loadingStudentAttempts ? (
                            <p style={{ padding: '20px 0' }}>Loading quiz history...</p>
                        ) : studentAttemptsError ? (
                            <p style={{ color: 'red', padding: '20px 0' }}>{studentAttemptsError}</p>
                        ) : (
                            <>
                                {(() => {
                                    const attemptedCount = studentAttempts.length;
                                    const marksObtained = studentAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
                                    const marksTotal = studentAttempts.reduce((sum, a) => sum + (a.total || 0), 0);
                                    return (
                                        <div className="modal-stats-row">
                                            <div className="modal-stat">
                                                <span className="modal-stat-num">{attemptedCount}</span>
                                                <span className="modal-stat-label">Quizzes Attempted</span>
                                            </div>
                                            <div className="modal-stat">
                                                <span className="modal-stat-num">{marksObtained}/{marksTotal}</span>
                                                <span className="modal-stat-label">Marks Obtained</span>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {studentAttempts.length === 0 ? (
                                    <p style={{ color: '#888', fontSize: '13px' }}>This student hasn't attempted any quizzes yet.</p>
                                ) : (
                                    <table className="modal-attempts-table">
                                        <thead>
                                            <tr>
                                                <th>Quiz</th>
                                                <th>Marks</th>
                                                <th>Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {studentAttempts.map((a) => (
                                                <tr key={a._id}>
                                                    <td>{a.quizTitle}</td>
                                                    <td>
                                                        {terminationLabel(a.terminationReason) ? (
                                                            <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                                                                {terminationLabel(a.terminationReason)}
                                                            </span>
                                                        ) : (
                                                            `${a.score}/${a.total}`
                                                        )}
                                                    </td>
                                                    <td>{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;