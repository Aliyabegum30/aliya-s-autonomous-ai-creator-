// LLM wrapper. Gemini is the primary provider (free tier, JSON-friendly);
// Groq is used ONLY as a fallback if Gemini fails and GROQ_API_KEY is set.
// Both call sites (editorial.js, generator.js) only ever ask for JSON back —
// there is no free-text chat mode here.
//
// Model names are read from env so they can be updated without a code
// change if a provider renames/retires a model: verify the current model
// id in the provider's docs before deploying (see README "LLM setup").

const { fetchJson } = require('./http');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const LLM_TIMEOUT_MS = 15000;

/** Strip ```json fences etc. and parse. Throws with the raw text on failure. */
function parseJsonResponse(raw) {
  if (typeof raw !== 'string') {
    throw new Error('LLM response was not text.');
  }
  const cleaned = raw.replace(/^```json\s*|^```\s*|```\s*$/gim, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`LLM response was not valid JSON: ${err.message}. Raw: ${cleaned.slice(0, 300)}`);
  }
}

async function callGemini(prompt, systemInstruction) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const data = await fetchJson(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    LLM_TIMEOUT_MS
  );

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini response had no text content: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return parseJsonResponse(text);
}

async function callGroq(prompt, systemInstruction) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set.');

  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });

  const data = await fetchJson(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }),
    },
    LLM_TIMEOUT_MS
  );

  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`Groq response had no message content: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return parseJsonResponse(text);
}

/**
 * Ask the primary LLM (Gemini) for structured JSON; fall back to Groq only
 * if GROQ_API_KEY is configured and Gemini fails. Throws if both fail (or
 * only Gemini is configured and it fails) — callers must treat that as an
 * `llm_failure` cycle outcome, never crash the process.
 */
async function generateJson(prompt, systemInstruction) {
  try {
    return await callGemini(prompt, systemInstruction);
  } catch (geminiErr) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error(`Gemini failed and no Groq fallback configured: ${geminiErr.message}`);
    }
    try {
      return await callGroq(prompt, systemInstruction);
    } catch (groqErr) {
      throw new Error(`Gemini failed (${geminiErr.message}); Groq fallback also failed (${groqErr.message})`);
    }
  }
}

module.exports = { generateJson, parseJsonResponse, GEMINI_MODEL, GROQ_MODEL };
