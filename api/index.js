import 'dotenv/config';
import app from '../server/src/app.js';
import { connectDB } from '../server/src/config/db.js';

// Vercel reuses the same function instance across requests when it's still
// "warm", so this promise is created once and awaited on every request
// rather than reconnecting every time — connectDB() itself is also
// idempotent (it returns the cached db if already connected).
let dbPromise = null;

export default async function handler(req, res) {
    try {
        if (!dbPromise) {
            dbPromise = connectDB();
        }
        await dbPromise;
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        dbPromise = null; // let the next request try again instead of staying broken
        res.status(500).json({ error: 'Database connection failed' });
        return;
    }

    // Express apps are just (req, res) => void functions under the hood,
    // so handing the request straight to `app` works as a Vercel Function.
    return app(req, res);
}
