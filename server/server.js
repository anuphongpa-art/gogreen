require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 8787;
const PROVIDER = (process.env.CHAT_PROVIDER || 'openai').toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_SYSTEM_PROMPT_LENGTH = 6000;

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map(s => s.trim()) }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

function validateChatBody(body) {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object.';
  const { systemPrompt, messages } = body;

  if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
    return 'systemPrompt is required and must be a non-empty string.';
  }
  if (systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    return `systemPrompt is too long (max ${MAX_SYSTEM_PROMPT_LENGTH} characters).`;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'messages must be a non-empty array.';
  }
  if (messages.length > MAX_MESSAGES) {
    return `Too many messages in this conversation (max ${MAX_MESSAGES}).`;
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object') return 'Each message must be an object.';
    if (m.role !== 'user' && m.role !== 'assistant') return 'Each message role must be "user" or "assistant".';
    if (typeof m.content !== 'string' || !m.content.trim()) return 'Each message must have non-empty string content.';
    if (m.content.length > MAX_MESSAGE_LENGTH) return `A message is too long (max ${MAX_MESSAGE_LENGTH} characters).`;
  }
  return null;
}

async function callOpenAI(systemPrompt, messages) {
  if (!OPENAI_API_KEY) throw new Error('Server is missing OPENAI_API_KEY.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': 'Bearer ' + OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.6,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `OpenAI request failed (HTTP ${res.status}).`);
  return data.choices?.[0]?.message?.content || '(no response)';
}

async function callAnthropic(systemPrompt, messages) {
  if (!ANTHROPIC_API_KEY) throw new Error('Server is missing ANTHROPIC_API_KEY.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Anthropic request failed (HTTP ${res.status}).`);
  return data.content?.[0]?.text || '(no response)';
}

async function callGemini(systemPrompt, messages) {
  if (!GEMINI_API_KEY) throw new Error('Server is missing GEMINI_API_KEY.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Gemini request failed (HTTP ${res.status}).`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
}

app.get('/health', (req, res) => {
  res.json({ ok: true, provider: PROVIDER });
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  const validationError = validateChatBody(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { systemPrompt, messages } = req.body;

  try {
    let reply;
    if (PROVIDER === 'anthropic') reply = await callAnthropic(systemPrompt, messages);
    else if (PROVIDER === 'gemini') reply = await callGemini(systemPrompt, messages);
    else reply = await callOpenAI(systemPrompt, messages);
    res.json({ reply });
  } catch (err) {
    console.error('[chat] provider error:', err.message);
    res.status(502).json({ error: 'The AI provider could not be reached. Please try again shortly.' });
  }
});

app.listen(PORT, () => {
  console.log(`AquaGreen AI chat server listening on http://localhost:${PORT} (provider: ${PROVIDER})`);
});
