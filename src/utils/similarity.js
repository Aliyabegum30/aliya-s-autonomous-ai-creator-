// Deterministic keyword-signature similarity.
// Deliberately NOT a vector database / embeddings — the hackathon brief
// explicitly asked for keyword/signature similarity unless there's a
// concrete reason for something heavier, and there isn't one here.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'to', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'it',
  'its', 'as', 'at', 'by', 'from', 'into', 'about', 'how', 'why', 'what',
  'new', 'show', 'hn', 'ask',
]);

/**
 * Turn free text into a normalized, order-independent set of significant
 * words. Used both to build a topicKey and to compare two topics.
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w)); // keep 2-letter terms like "ai", "ml", "ci"
}

/**
 * Deterministic topic key: sorted, de-duplicated significant words joined
 * with '-'. Two titles that differ only in word order or stopwords/casing
 * produce the same key, so it doubles as an exact-duplicate signature.
 */
function topicKey(title) {
  const tokens = Array.from(new Set(tokenize(title))).sort();
  return tokens.join('-') || 'untitled';
}

/**
 * Jaccard similarity between the token sets of two strings, 0..1.
 * Used for NEAR-duplicate detection (different topicKey, same underlying
 * story/angle).
 */
function similarity(textA, textB) {
  const a = new Set(tokenize(textA));
  const b = new Set(tokenize(textB));
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const tok of a) {
    if (b.has(tok)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

module.exports = { tokenize, topicKey, similarity };
