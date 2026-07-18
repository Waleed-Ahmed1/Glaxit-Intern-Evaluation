import jwt from 'jsonwebtoken';

// Verifies the JWT sent in the Authorization header (format: "Bearer <token>")
// and attaches the decoded payload to req.user for downstream routes to use.
export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role, email, domain }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// Use after requireAuth to restrict a route to specific roles, e.g.:
// router.get('/admin-only', requireAuth, requireRole('admin'), handler)
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'You do not have permission to access this resource' });
        }
        next();
    };
}