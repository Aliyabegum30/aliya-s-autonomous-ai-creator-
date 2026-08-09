// STEP 4 (MEMORY CHECK).
//
// Prevents duplicate/near-duplicate topics and repeated angles using the
// existing memory_signatures table.
//
// Published topics are treated as permanent memory.
// Rejected topics are treated as temporary memory and are only blocked
// during the configured cooldown period.
//
// Duplicate detection uses:
//   1. Exact topicKey matching
//   2. Jaccard keyword similarity above a threshold
//
// Deliberately a deterministic keyword-signature approach, not a vector
// database.

const queries = require('../storage/queries');
const { topicKey, similarity } = require('../utils/similarity');

const NEAR_DUPLICATE_THRESHOLD = 0.6;

// Rejected topics are temporarily blocked so the agent does not repeatedly
// process the same rejected story every hour.
//
// After this period, the topic can be reconsidered if it appears again and
// still passes discovery/filter/editorial checks.
const REJECTED_COOLDOWN_HOURS = 24;

/**
 * STEP 4 — MEMORY CHECK
 *
 * @param {string} agentId
 * @param {object[]} candidates
 *   Normalized + deterministically-filtered candidates.
 *
 * @returns {Promise<{
 *   survivors: object[],
 *   rejected: {
 *     topic: string,
 *     reason: string,
 *     scores: object
 *   }[]
 * }>}
 */
async function applyMemoryCheck(agentId, candidates) {
  const recentSignatures = await queries.getRecentSignatures(agentId);

  const now = Date.now();

  // ------------------------------------------------------------
  // 1. PUBLISHED MEMORY
  // ------------------------------------------------------------
  //
  // Published topics are permanent memory.
  // The agent should never publish the same topic again.
  //
  const publishedKeys = new Set(
    recentSignatures
      .filter((signature) => signature.origin === 'published')
      .map((signature) => signature.topic_key)
  );

  // ------------------------------------------------------------
  // 2. REJECTED MEMORY
  // ------------------------------------------------------------
  //
  // Rejected topics are NOT permanent memory.
  //
  // They are only blocked for REJECTED_COOLDOWN_HOURS. This prevents
  // the same rejected story from being reconsidered every hour while
  // still allowing the agent to reconsider it later if the story
  // develops or becomes relevant again.
  //
  const recentRejectedKeys = recentSignatures
    .filter((signature) => {
      if (signature.origin !== 'rejected') {
        return false;
      }

      const createdAt = new Date(signature.created_at).getTime();

      // Ignore malformed timestamps rather than accidentally blocking
      // a topic forever.
      if (!Number.isFinite(createdAt)) {
        return false;
      }

      const ageHours =
        (now - createdAt) / (1000 * 60 * 60);

      return ageHours < REJECTED_COOLDOWN_HOURS;
    })
    .map((signature) => signature.topic_key);

  // Published topics + recently rejected topics are currently blocked.
  const seenKeys = new Set([
    ...publishedKeys,
    ...recentRejectedKeys,
  ]);

  const survivors = [];
  const rejected = [];

  // Track keys accepted during this same cycle so that two
  // near-identical candidates cannot both survive in one batch.
  const acceptedThisCycle = [];

  // ------------------------------------------------------------
  // 3. CHECK EVERY CANDIDATE
  // ------------------------------------------------------------

  for (const candidate of candidates) {
    const key = topicKey(candidate.title);

    // ----------------------------------------------------------
    // EXACT DUPLICATE
    // ----------------------------------------------------------

    if (seenKeys.has(key)) {
      rejected.push({
        topic: candidate.title,
        reason: 'duplicate',
        scores: {
          topicKey: key,
          match: 'exact',
        },
      });

      continue;
    }

    // ----------------------------------------------------------
    // NEAR DUPLICATE
    // ----------------------------------------------------------
    //
    // Compare the candidate against:
    //   - published topics
    //   - recently rejected topics
    //   - candidates already accepted in this cycle
    //
    const nearDuplicate = [
      ...seenKeys,
      ...acceptedThisCycle,
    ].find(
      (existingKey) =>
        similarity(
          key.replace(/-/g, ' '),
          existingKey.replace(/-/g, ' ')
        ) >= NEAR_DUPLICATE_THRESHOLD
    );

    if (nearDuplicate) {
      rejected.push({
        topic: candidate.title,
        reason: 'duplicate',
        scores: {
          topicKey: key,
          match: 'near_duplicate',
          similarTo: nearDuplicate,
        },
      });

      continue;
    }

    // ----------------------------------------------------------
    // SURVIVOR
    // ----------------------------------------------------------

    acceptedThisCycle.push(key);

    survivors.push({
      ...candidate,
      topicKey: key,
    });
  }

  return {
    survivors,
    rejected,
  };
}

module.exports = {
  applyMemoryCheck,
  NEAR_DUPLICATE_THRESHOLD,
  REJECTED_COOLDOWN_HOURS,
};