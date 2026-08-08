// STEP 7 (GENERATE).
//
// Generates { text, rationale } for the single selected candidate, grounded
// only in the discovered title/url/snippet — the LLM is explicitly
// instructed not to invent facts beyond what was discovered.

const { generateJson } = require('../utils/llm');
const { PERSONA } = require('../persona/postmortem');

function buildPrompt(candidate, otherCandidateTitles) {
  const alternatives = otherCandidateTitles.length
    ? `Other candidates considered this cycle but not selected: ${otherCandidateTitles.join('; ')}.`
    : 'No other candidates survived this cycle.';

  return `You are writing as "${PERSONA.name}", ${PERSONA.domain}.

VOICE: ${PERSONA.tone}
EDITORIAL BELIEFS:
${PERSONA.beliefs.map((b) => `- ${b}`).join('\n')}
Example of the voice: "${PERSONA.voiceExample}"

You are writing ONE short post about the following discovered item. You MUST stay grounded strictly in the information given below — do not invent statistics, company names, dates, or outcomes that are not present in the source material. If the source lacks enough detail to name a specific mechanism, say so plainly rather than fabricating one.

SOURCE TITLE: ${candidate.title}
SOURCE URL: ${candidate.url}
SOURCE SNIPPET: ${candidate.snippet || '(no snippet available — rely on the title only, and be appropriately cautious about specifics)'}
SOURCE PUBLISHED: ${candidate.publishedAt || 'unknown'}
EDITORIAL SCORES THIS CYCLE: ${JSON.stringify(candidate.editorialScores || {})}

${alternatives}

Write:
1. "text" — the post itself, 80-180 words, in the Postmortem voice. Should read like a clinical incident note, not a news blurb or a LinkedIn post.
2. "rationale" — 2-4 sentences explicitly covering: (a) why this topic was selected, (b) why it's relevant now, (c) why it was preferred over the other candidates considered this cycle (or why it stood on its own if there were none).

Respond with ONLY a JSON object (no prose, no markdown fences), shaped exactly as:
{ "text": string, "rationale": string }`;
}

/**
 * @param {object} candidate the single selected candidate (with topicKey, editorialScores)
 * @param {string[]} otherCandidateTitles titles of other candidates considered this cycle
 * @returns {Promise<{ text: string, rationale: string }>}
 * @throws on LLM failure — caller records `llm_failure` and does not crash
 */
async function generatePost(candidate, otherCandidateTitles = []) {
  const prompt = buildPrompt(candidate, otherCandidateTitles);
  const result = await generateJson(prompt);

  if (!result || typeof result.text !== 'string' || typeof result.rationale !== 'string') {
    throw new Error('Post generation response was missing text/rationale.');
  }
  return { text: result.text.trim(), rationale: result.rationale.trim() };
}

module.exports = { generatePost, buildPrompt };
