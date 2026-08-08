// Thin wrapper around global fetch that enforces a timeout via AbortController.
// Every external call (Hacker News, RSS, Gemini, Groq) goes through this so a
// single slow/hanging source can never hang the whole cycle.

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetchWithTimeout + JSON parse + status check, wrapped so callers get a
 * plain rejected promise with a readable message instead of having to check
 * response.ok / try-catch JSON parsing themselves everywhere.
 */
async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const res = await fetchWithTimeout(url, options, timeoutMs);
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with status ${res.status}`);
  }
  return res.json();
}

module.exports = { fetchWithTimeout, fetchJson, DEFAULT_TIMEOUT_MS };
