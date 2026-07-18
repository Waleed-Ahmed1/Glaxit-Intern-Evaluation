import { buildQuizGenerationPrompt } from '../prompts/quizGenerationPrompt.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Strips ```json ... ``` or ``` ... ``` fences if the model wraps its
// output in them despite being told not to — cheap robustness, not a
// replacement for the strict prompt instructions above.
function stripCodeFences(text) {
    const trimmed = text.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenceMatch ? fenceMatch[1] : trimmed;
}

function validateQuestionShape(q, index) {
    if (!q || typeof q !== 'object') {
        throw new Error(`Question ${index + 1} is not a valid object`);
    }
    if (!q.text || typeof q.text !== 'string') {
        throw new Error(`Question ${index + 1} is missing "text"`);
    }
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => typeof o !== 'string' || !o.trim())) {
        throw new Error(`Question ${index + 1} must have exactly 4 non-empty "options"`);
    }
    const correctIndex = Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3
        ? q.correctIndex
        : 0;
    const points = Number.isInteger(q.points) && q.points > 0 ? q.points : 1;

    return { text: q.text, options: q.options, correctIndex, points };
}

export async function generateQuizQuestions({ task, domain, numQuestions }) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY is not set on the server — add it to server/.env');
    }
    if (!task || !task.trim()) {
        throw new Error('A task/topic description is required');
    }

    const prompt = buildQuizGenerationPrompt({ task, domain, numQuestions });
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Groq API error (${res.status}): ${errBody || res.statusText}`);
    }

    const data = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content;
    if (!rawContent) {
        throw new Error('Groq returned an empty response');
    }

    let parsed;
    try {
        parsed = JSON.parse(stripCodeFences(rawContent));
    } catch (err) {
        throw new Error('The AI response was not valid JSON. Try again or rephrase the task.');
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('The AI response did not contain a non-empty array of questions');
    }

    return parsed.map(validateQuestionShape);
}