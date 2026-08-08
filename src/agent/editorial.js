// STEP 5 (EDITORIAL JUDGMENT).
//
// Scores surviving candidates with the LLM against the Postmortem persona's
// standards and decides accept/reject per candidate. The LLM is explicitly
// allowed — expected — to reject candidates; this is not a rubber stamp.
//
// A candidate only survives if BOTH the LLM says accepted:true AND the
// average of its six scores clears SCORE_THRESHOLD. The numeric floor is a
// deliberate second check so a model that defaults to lenient booleans
// can't silently disable editorial judgment.

const { generateJson } = require('../utils/llm');
const { PERSONA } = require('../persona/postmortem');

const SCORE_THRESHOLD = 6; // out of 10
const MAX_CANDIDATES_PER_CYCLE = 10; // cap LLM cost per cycle

const SCORE_FIELDS = ['relevance', 'timeliness', 'technicalSignificance', 'originality', 'personaAlignment', 'usefulness'];

function buildPrompt(candidates) {
  const candidateList = candidates
    .map((c, i) => `${i}. TITLE: ${c.title}\n   URL: ${c.url}\n   SNIPPET: ${(c.snippet || '(none)').slice(0, 300)}\n   PUBLISHED: ${c.publishedAt || 'unknown'}`)
    .join('\n\n');

  return `You are the editorial judgment module for an AI persona called "${PERSONA.name}" (${PERSONA.domain}).

PERSONA MISSION: ${PERSONA.mission}
PERSONA TONE: ${PERSONA.tone}
EDITORIAL BELIEFS:
${PERSONA.beliefs.map((b) => `- ${b}`).join('\n')}

The persona covers: ${PERSONA.followTopics.join(', ')}.
The persona explicitly rejects: rumor-only claims, vague AI news, funding/valuation news, celebrity AI drama, generic AI announcements, vendor marketing with no technical substance, speculative future-risk articles, and anything with no identifiable technical mechanism.

Score EACH of the following candidates on a 1-10 scale for each field below, then decide whether it meets the bar for this persona. A candidate should only be accepted if it plausibly describes (or could be reported on to reveal) a concrete technical failure mechanism relevant to production AI systems — not just any AI news.

Candidates:
${candidateList}

Respond with ONLY a JSON array (no prose, no markdown fences), one object per candidate, in the same order, each shaped exactly as:
{
  "index": number,
  "relevance": number,
  "timeliness": number,
  "technicalSignificance": number,
  "originality": number,
  "personaAlignment": number,
  "usefulness": number,
  "accepted": boolean,
  "rejectionReason": string
}
"rejectionReason" must be a short human-readable sentence explaining the decision, whether accepted or rejected.`;
}

function averageScore(scores) {
  const values = SCORE_FIELDS.map((f) => Number(scores[f]) || 0);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function validateScoreEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.index !== 'number') return false;
  if (typeof entry.accepted !== 'boolean') return false;
  return SCORE_FIELDS.every((f) => typeof entry[f] === 'number');
}

/**
 * @param {string} agentId (unused directly, kept for future per-agent tuning)
 * @param {object[]} candidates candidates that survived filter + memory check
 * @returns {Promise<{ accepted: object[], rejected: object[] }>}
 * @throws on total LLM failure — caller records `llm_failure` and does not crash
 */
async function applyEditorialJudgment(candidates) {
  if (candidates.length === 0) {
    return { accepted: [], rejected: [] };
  }

  const scoredCandidates = candidates.slice(0, MAX_CANDIDATES_PER_CYCLE);
  const prompt = buildPrompt(scoredCandidates);

  const raw = await generateJson(prompt);
  if (!Array.isArray(raw)) {
    throw new Error('Editorial scoring response was not a JSON array.');
  }

  const accepted = [];
  const rejected = [];

  for (const entry of raw) {
    if (!validateScoreEntry(entry) || entry.index < 0 || entry.index >= scoredCandidates.length) {
      continue; // malformed entry — skip rather than crash the cycle
    }
    const candidate = scoredCandidates[entry.index];
    const scores = {};
    for (const field of SCORE_FIELDS) scores[field] = entry[field];
    const avg = averageScore(scores);

    if (entry.accepted && avg >= SCORE_THRESHOLD) {
      accepted.push({ ...candidate, editorialScores: scores, editorialAverage: avg, rationale: entry.rejectionReason });
    } else {
      rejected.push({
        topic: candidate.title,
        reason: 'below_threshold',
        scores: { ...scores, average: avg, llmAccepted: entry.accepted, note: entry.rejectionReason },
      });
    }
  }

  // Anything the LLM didn't return a valid entry for is treated as
  // rejected-by-omission (invalid_output) rather than silently dropped.
  const scoredIndices = new Set(raw.filter(validateScoreEntry).map((e) => e.index));
  scoredCandidates.forEach((candidate, i) => {
    if (!scoredIndices.has(i)) {
      rejected.push({ topic: candidate.title, reason: 'invalid_output', scores: null });
    }
  });

  return { accepted, rejected };
}

module.exports = { applyEditorialJudgment, SCORE_THRESHOLD, MAX_CANDIDATES_PER_CYCLE, SCORE_FIELDS, averageScore, validateScoreEntry };
