// app.js → Configures Express (middleware, routes, etc.).
import express from 'express';
import authRoutes from './routes/auth.routes.js';
import quizRoutes from './routes/quiz.routes.js';
import userRoutes from './routes/user.routes.js';
import aiRoutes from './routes/ai.routes.js';
import cors from 'cors';

const app = express()

app.use(express.json())

app.use(cors());

app.get('/',(req,res) => {
    res.send("Hello Waleed !")
})

// Public server-time check — the frontend uses this to sync its "now" with
// the server clock instead of trusting the browser's system clock, so a
// student can't unlock a quiz early by changing their computer's date/time.
app.get('/api/time', (req, res) => {
    res.json({ now: Date.now() });
})

app.use('/api/auth', authRoutes); 
app.use('/api/quizzes', quizRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);


export default app;