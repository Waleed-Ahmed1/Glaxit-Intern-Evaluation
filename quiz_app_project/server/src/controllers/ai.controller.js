import { generateQuizQuestions } from '../services/groq.service.js';

export async function generateQuiz(req, res) {
    try {
        const { task, domain, numQuestions } = req.body;

        if (!task || typeof task !== 'string' || !task.trim()) {
            return res.status(400).json({ error: 'Please provide a task/topic description' });
        }

        const questions = await generateQuizQuestions({ task, domain, numQuestions });
        res.json({ questions });
    } catch (err) {
        console.error('AI quiz generation error:', err.message);
        res.status(500).json({ error: err.message || 'Failed to generate quiz questions' });
    }
}