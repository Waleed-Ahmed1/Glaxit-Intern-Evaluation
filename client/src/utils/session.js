// Centralizes how the login session (JWT + user info) is stored, read, and
// expired on the client. A session is only considered valid for
// SESSION_DURATION_MS from the moment it was saved — after that, even
// though the token is still physically sitting in localStorage, we treat it
// as expired and send the person back to the login form. This is separate
// from (and shorter than) the backend JWT's own expiry.
//
// Logging out clears everything immediately, so there's no lingering
// session to auto-restore — the person has to log in again from scratch.

const TOKEN_KEY = 'quiz_token';
const USER_KEY = 'quiz_user';
const LOGIN_TIME_KEY = 'quiz_login_time';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

// Call this right after a successful login.
export function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(LOGIN_TIME_KEY, String(Date.now()));
}

// Returns { token, user } if there's a still-valid saved session, or null if
// there isn't one (never logged in, logged out, or the 1-day window has
// passed). If it finds an expired session it also clears storage on the way
// out, so the next check — and any other tab reading the same localStorage —
// sees a clean slate instead of a stale, half-expired session.
export function getSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    const loginTime = Number(localStorage.getItem(LOGIN_TIME_KEY));

    if (!token || !rawUser || !loginTime) {
        return null;
    }

    if (Date.now() - loginTime > SESSION_DURATION_MS) {
        clearSession();
        return null;
    }

    try {
        const user = JSON.parse(rawUser);
        if (!user || !user.role) return null;
        return { token, user };
    } catch {
        return null;
    }
}

// Call this on logout — wipes the session so nothing auto-restores next visit.
export function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LOGIN_TIME_KEY);
}