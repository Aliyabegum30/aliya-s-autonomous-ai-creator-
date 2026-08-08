// STEP 3 (DETERMINISTIC FILTER).
//
// Cheap, non-LLM pass that removes obviously unsuitable candidates before
// any LLM call is spent scoring them: avoid-list keyword matches and
// candidates with no discoverable freshness signal beyond a max age.
//
// Returns { survivors, rejected } where `rejected` entries are ready to be
// written straight to rejected_topics (reason: 'avoid_list').

const { PERSONA } = require('../persona/postmortem');

const MAX_AGE_DAYS = 14;

function matchesAvoidList(candidate) {
  const haystack = `${candidate.title} ${candidate.snippet || ''}`.toLowerCase();
  return PERSONA.avoidKeywords.find((keyword) => haystack.includes(keyword.toLowerCase())) || null;
}

function isStale(candidate) {
  if (!candidate.publishedAt) return false; // no timestamp available — don't penalize, let editorial judge it
  const ageMs = Date.now() - new Date(candidate.publishedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > MAX_AGE_DAYS;
}

/**
 * @param {object[]} candidates normalized candidates from discovery.js
 * @returns {{ survivors: object[], rejected: {topic: string, reason: string, scores: null}[] }}
 */
function applyDeterministicFilter(candidates) {
  const survivors = [];
  const rejected = [];

  for (const candidate of candidates) {
    const avoidMatch = matchesAvoidList(candidate);
    if (avoidMatch) {
      rejected.push({
        topic: candidate.title,
        reason: 'avoid_list',
        scores: { matchedKeyword: avoidMatch },
      });
      continue;
    }

    if (isStale(candidate)) {
      rejected.push({
        topic: candidate.title,
        reason: 'below_threshold',
        scores: { staleDays: MAX_AGE_DAYS },
      });
      continue;
    }

    survivors.push(candidate);
  }

  return { survivors, rejected };
}

module.exports = { applyDeterministicFilter, matchesAvoidList, isStale, MAX_AGE_DAYS };
