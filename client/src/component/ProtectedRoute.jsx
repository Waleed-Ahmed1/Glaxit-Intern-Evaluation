import { Navigate } from 'react-router-dom';
import { getSession } from '../utils/session';

// Wraps a route so it only renders for a logged-in user with an allowed
// role AND a still-valid (< 1 day old) session — see utils/session.js.
//
// - No session at all, or an expired one -> sent to /login.
// - Logged in but wrong role for this route (e.g. an admin opening
//   /student, or a student opening /admin) -> sent back to THEIR OWN
//   portal instead of rendering the page they weren't supposed to see.
function ProtectedRoute({ allowedRoles, children }) {
    const session = getSession();

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    if (!allowedRoles.includes(session.user.role)) {
        return <Navigate to={session.user.role === 'admin' ? '/admin' : '/student'} replace />;
    }

    return children;
}

export default ProtectedRoute;