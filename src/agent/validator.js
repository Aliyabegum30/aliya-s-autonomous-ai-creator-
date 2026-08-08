// STEP 8 (VALIDATE).
//
// Last gate before STORE. Nothing reaches the posts table without passing
// this — including a basic groundedness check (the URL that was actually
// discovered must appear in sources) and a near-duplicate check against
// recently published text.

const { similarity } = require('../utils/similarity');

const NEAR_DUPLICATE_TEXT_THRESHOLD = 0.75;

function isValidIsoUtcTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}

function isValidUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {{ text: string, rationale: string, sources: string[], createdAt: string }} post
 * @param {string} sourceUrl the URL that was actually discovered for this candidate
 * @param {string[]} recentPostTexts recently published post texts, for near-duplicate check
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validatePost(post, sourceUrl, recentPostTexts = []) {
  if (!post || typeof post.text !== 'string' || post.text.trim().length === 0) {
    return { valid: false, reason: 'Post text is empty.' };
  }
  if (typeof post.rationale !== 'string' || post.rationale.trim().length === 0) {
    return { valid: false, reason: 'Post rationale is empty.' };
  }
  if (!Array.isArray(post.sources) || post.sources.length === 0 || !post.sources.some(isValidUrl)) {
    return { valid: false, reason: 'Post has no valid source URL.' };
  }
  if (!isValidIsoUtcTimestamp(post.createdAt)) {
    return { valid: false, reason: 'Post createdAt is not a valid ISO 8601 UTC timestamp.' };
  }
  if (sourceUrl && !post.sources.includes(sourceUrl)) {
    return { valid: false, reason: 'Post sources do not include the actually-discovered source URL (grounding check failed).' };
  }

  const duplicate = recentPostTexts.find((prevText) => similarity(post.text, prevText) >= NEAR_DUPLICATE_TEXT_THRESHOLD);
  if (duplicate) {
    return { valid: false, reason: 'Post text is a near-duplicate of a recently published post.' };
  }

  return { valid: true };
}

module.exports = { validatePost, isValidIsoUtcTimestamp, isValidUrl, NEAR_DUPLICATE_TEXT_THRESHOLD };
