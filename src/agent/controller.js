// Orchestrates one full autonomous cycle:
//   DISCOVER -> NORMALIZE -> FILTER -> MEMORY CHECK -> EDITORIAL JUDGMENT
//   -> SELECT -> GENERATE -> VALIDATE -> STORE -> COMPLETE
//
// This is the ONLY entry point that is allowed to call the LLM or write a
// post. It is invoked by POST /internal/run-cycle (via GitHub Actions) and,
// best-effort, once by POST /api/agent/init. GET /api/agent/feed never
// calls this.
//
// Every stage is wrapped so a single failure ends the cycle with a
// recorded outcome instead of throwing out of this function. "Everything
// got rejected" and "the source was down" are both valid, non-crashing
// outcomes.

const queries = require('../storage/queries');
const discovery = require('./discovery');
const filter = require('./filter');
const memory = require('./memory');
const editorial = require('./editorial');
const generator = require('./generator');
const validator = require('./validator');
const { topicKey } = require('../utils/similarity');

const STALE_IN_PROGRESS_MS = 10 * 60 * 1000; // treat a stuck 'in_progress' row older than this as orphaned

async function recordRejections(agentId, rejections) {
  for (const r of rejections) {
    try {
      await queries.insertRejectedTopic(agentId, r.topic, r.reason, r.scores);
      await queries.insertSignature(agentId, topicKey(r.topic), 'rejected');
    } catch (err) {
      // A logging failure must not abort the cycle.
      console.error('[controller] Failed to record rejection:', err.message);
    }
  }
}

/**
 * @param {string} agentId
 * @returns {Promise<{ outcome: string, detail?: string, postId?: string }>}
 */
async function runCycle(agentId) {
  // Overlap guard: skip if a cycle for this agent is genuinely still running.
  const recent = await queries.getRecentCycleRuns(agentId, 1);
  if (recent.length > 0 && recent[0].outcome === 'in_progress') {
    const ageMs = Date.now() - new Date(recent[0].started_at).getTime();
    if (ageMs < STALE_IN_PROGRESS_MS) {
      return { outcome: 'skipped', detail: 'A cycle is already in progress for this agent.' };
    }
    // Otherwise treat as an orphaned row (process crashed mid-cycle) and proceed.
  }

  const cycleRunId = await queries.startCycleRun(agentId);

  try {
    // STEP 1 + 2 — DISCOVER, NORMALIZE
    let candidates;
    try {
      const discovered = await discovery.discoverTopics();
      candidates = discovered.candidates;
    } catch (err) {
      await queries.finishCycleRun(cycleRunId, 'source_failure', err.message.slice(0, 500));
      return { outcome: 'source_failure', detail: err.message };
    }

    // STEP 3 — DETERMINISTIC FILTER
    const filterResult = filter.applyDeterministicFilter(candidates);
    await recordRejections(agentId, filterResult.rejected);

    if (filterResult.survivors.length === 0) {
      await queries.finishCycleRun(cycleRunId, 'rejected_all', 'All candidates rejected by the deterministic filter.');
      return { outcome: 'rejected_all', detail: 'All candidates rejected by the deterministic filter.' };
    }

    // STEP 4 — MEMORY CHECK
    const memoryResult = await memory.applyMemoryCheck(agentId, filterResult.survivors);
    await recordRejections(agentId, memoryResult.rejected);

    if (memoryResult.survivors.length === 0) {
      await queries.finishCycleRun(cycleRunId, 'rejected_all', 'All surviving candidates were duplicates of prior topics.');
      return { outcome: 'rejected_all', detail: 'All surviving candidates were duplicates of prior topics.' };
    }

    // STEP 5 — EDITORIAL JUDGMENT
    let editorialResult;
    try {
      editorialResult = await editorial.applyEditorialJudgment(memoryResult.survivors);
    } catch (err) {
      await queries.finishCycleRun(cycleRunId, 'llm_failure', `Editorial scoring failed: ${err.message}`.slice(0, 500));
      return { outcome: 'llm_failure', detail: `Editorial scoring failed: ${err.message}` };
    }
    await recordRejections(agentId, editorialResult.rejected);

    if (editorialResult.accepted.length === 0) {
      await queries.finishCycleRun(cycleRunId, 'rejected_all', 'No candidate met the editorial threshold this cycle.');
      return { outcome: 'rejected_all', detail: 'No candidate met the editorial threshold this cycle.' };
    }

    // STEP 6 — SELECT
    const selected = editorialResult.accepted.reduce((best, c) => (c.editorialAverage > best.editorialAverage ? c : best));
    const otherTitles = editorialResult.accepted.filter((c) => c !== selected).map((c) => c.title);

    // STEP 7 — GENERATE
    let generated;
    try {
      generated = await generator.generatePost(selected, otherTitles);
    } catch (err) {
      await recordRejections(agentId, [{ topic: selected.title, reason: 'invalid_output', scores: { error: err.message } }]);
      await queries.finishCycleRun(cycleRunId, 'llm_failure', `Post generation failed: ${err.message}`.slice(0, 500));
      return { outcome: 'llm_failure', detail: `Post generation failed: ${err.message}` };
    }

    const candidatePost = {
      text: generated.text,
      rationale: generated.rationale,
      sources: [selected.url],
      createdAt: new Date().toISOString(),
    };

    // STEP 8 — VALIDATE
    const recentTexts = await queries.getRecentPostTexts(agentId);
    const validation = validator.validatePost(candidatePost, selected.url, recentTexts);

    if (!validation.valid) {
      await recordRejections(agentId, [{ topic: selected.title, reason: 'invalid_output', scores: { reason: validation.reason } }]);
      await queries.finishCycleRun(cycleRunId, 'rejected_all', `Generated post failed validation: ${validation.reason}`.slice(0, 500));
      return { outcome: 'rejected_all', detail: `Generated post failed validation: ${validation.reason}` };
    }

    // STEP 9 — STORE
    const stored = await queries.insertPost(agentId, {
      text: candidatePost.text,
      rationale: candidatePost.rationale,
      sources: candidatePost.sources,
      topicKey: selected.topicKey,
    });
    await queries.insertSignature(agentId, selected.topicKey, 'published');
    await queries.touchAgentLastRun(agentId);

    // STEP 10 — COMPLETE
    const detail = `Published post ${stored.id} on topic "${selected.title}".`;
    await queries.finishCycleRun(cycleRunId, 'published', detail.slice(0, 500));
    return { outcome: 'published', postId: stored.id, detail };
  } catch (err) {
    // Catch-all safety net. Every expected failure mode is handled above;
    // this only fires on a genuinely unexpected error (e.g. a DB write
    // failing partway through). The cycle must still end cleanly.
    console.error('[controller] Unexpected error during cycle:', err);
    try {
      await queries.finishCycleRun(cycleRunId, 'llm_failure', `Unexpected error: ${err.message}`.slice(0, 500));
    } catch (finishErr) {
      console.error('[controller] Failed to even record cycle failure:', finishErr.message);
    }
    return { outcome: 'llm_failure', detail: `Unexpected error: ${err.message}` };
  }
}

module.exports = { runCycle };
