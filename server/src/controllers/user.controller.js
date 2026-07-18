import { listUsers } from '../models/user.model.js';

// Admin-only: list users, optionally filtered by role via ?role=student
export async function list(req, res) {
    try {
        const { role } = req.query;
        const users = await listUsers(role ? { role } : {});
        res.json(users);
    } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ error: 'Something went wrong fetching users' });
    }
}


