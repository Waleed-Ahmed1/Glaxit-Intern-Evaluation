import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail } from '../models/user.model.js';

function signToken(user) {
    return jwt.sign(
        { id: user._id, role: user.role, email: user.email, domain: user.domain || null },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

const VALID_DOMAINS = [
    'Frontend Development',
    'Backend Development',
    'Full Stack Development',
    'Mobile App Development',
    'Data Science',
    'DevOps',
    'UI/UX Design',
    'Quality Assurance',
];

export async function register(req, res) {
    try {
        const { name, email, password, role, domain } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'name, email, and password are required' });
        }

        const safeRole = role === 'admin' ? 'admin' : 'student';
        // Domain only matters for students; admins don't need one
        const safeDomain = safeRole === 'student'
            ? (VALID_DOMAINS.includes(domain) ? domain : null)
            : null;

        if (safeRole === 'student' && !safeDomain) {
            return res.status(400).json({ error: 'Please select a valid domain' });
        }

        const existing = await findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'A user with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await createUser({ name, email, passwordHash, role: safeRole, domain: safeDomain });

        const token = signToken(user);

        res.status(201).json({
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, domain: user.domain },
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Something went wrong during registration' });
    }
}

export async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = signToken(user);

        res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, domain: user.domain },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Something went wrong during login' });
    }
}