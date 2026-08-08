// STEP 4 (MEMORY CHECK).
//
// Prevents duplicate/near-duplicate topics and repeated angles using the
// existing memory_signatures table — exact topicKey match, or Jaccard
// similarity above a threshold against recent signatures. Deliberately a
// deterministic keyword-signature approach, not a vector database.

const queries = require('../storage/queries');
const { topicKey, similarity } = require('../utils/similarity');

const NEAR_DUPLICATE_THRESHOLD = 0.6;

/**
 * @param {string} agentId
 * @param {object[]} candidates normalized + deterministically-filtered candidates
 * @returns {Promise<{ survivors: object[], rejected: {topic: string, reason: string, scores: object}[] }>}
 */
async function applyMemoryCheck(agentId, candidates) {
  const recentSignatures = await queries.getRecentSignatures(agentId);
  const seenKeys = new Set(recentSignatures.map((s) => s.topic_key));

  const survivors = [];
  const rejected = [];
  // Track keys accepted within this same cycle so two near-duplicate
  // candidates in one batch don't both survive.
  const acceptedThisCycle = [];

  for (const candidate of candidates) {
    const key = topicKey(candidate.title);

    if (seenKeys.has(key)) {
      rejected.push({ topic: candidate.title, reason: 'duplicate', scores: { topicKey: key, match: 'exact' } });
      continue;
    }

    const nearDuplicate = [...seenKeys, ...acceptedThisCycle].find(
      (existingKey) => similarity(key.replace(/-/g, ' '), existingKey.replace(/-/g, ' ')) >= NEAR_DUPLICATE_THRESHOLD
    );

    if (nearDuplicate) {
      rejected.push({
        topic: candidate.title,
        reason: 'duplicate',
        scores: { topicKey: key, match: 'near_duplicate', similarTo: nearDuplicate },
      });
      continue;
    }

    acceptedThisCycle.push(key);
    survivors.push({ ...candidate, topicKey: key });
  }

  return { survivors, rejected };
}

module.exports = { applyMemoryCheck, NEAR_DUPLICATE_THRESHOLD };
