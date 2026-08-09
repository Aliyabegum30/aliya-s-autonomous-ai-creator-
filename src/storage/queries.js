// All SQL statements against the five existing tables
// (agents, posts, memory_signatures, rejected_topics, cycle_runs).
//
// Routes and the agent pipeline import this instead of writing raw SQL
// inline, so the query shapes live in exactly one place.
//
// NOTE: this file calls `db.query(...)` (not a destructured `query`) on
// purpose — it lets tests monkeypatch `db.query` on the shared module
// object without needing a mocking library.

const db = require('./db');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// AGENTS
// ---------------------------------------------------------------------------

async function createAgent(persona) {
  const result = await db.query(
    `INSERT INTO agents (persona)
     VALUES ($1)
     RETURNING agent_id, persona, created_at, last_run_at`,
    [JSON.stringify(persona)]
  );

  return result.rows[0];
}

async function getAgent(agentId) {
  if (!isValidUuid(agentId)) {
    return null;
  }

  const result = await db.query(
    `SELECT agent_id, persona, created_at, last_run_at
     FROM agents
     WHERE agent_id = $1`,
    [agentId]
  );

  return result.rows[0] || null;
}

async function touchAgentLastRun(agentId) {
  await db.query(
    `UPDATE agents
     SET last_run_at = now()
     WHERE agent_id = $1`,
    [agentId]
  );
}

// ---------------------------------------------------------------------------
// POSTS
// ---------------------------------------------------------------------------

async function insertPost(
  agentId,
  { text, rationale, sources, topicKey }
) {
  const result = await db.query(
    `INSERT INTO posts
      (agent_id, text, rationale, sources, topic_key)
     VALUES
      ($1, $2, $3, $4, $5)
     RETURNING id, created_at, text, rationale, sources`,
    [
      agentId,
      text,
      rationale,
      JSON.stringify(sources || []),
      topicKey,
    ]
  );

  return result.rows[0];
}

async function getPostsForAgent(agentId) {
  const result = await db.query(
    `SELECT
       id,
       created_at,
       text,
       rationale,
       sources
     FROM posts
     WHERE agent_id = $1
     ORDER BY created_at DESC, id DESC`,
    [agentId]
  );

  return result.rows;
}

async function getRecentPostTexts(agentId, limit = 50) {
  const result = await db.query(
    `SELECT text
     FROM posts
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, limit]
  );

  return result.rows.map((row) => row.text);
}

async function getLatestPost(agentId) {
  const result = await db.query(
    `SELECT
       id,
       created_at,
       text,
       rationale,
       sources
     FROM posts
     WHERE agent_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [agentId]
  );

  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// MEMORY SIGNATURES
// ---------------------------------------------------------------------------

async function getRecentSignatures(agentId, limit = 300) {
  const result = await db.query(
    `SELECT
       topic_key,
       origin,
       created_at
     FROM memory_signatures
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, limit]
  );

  return result.rows;
}

async function insertSignature(agentId, topicKeyValue, origin) {
  await db.query(
    `INSERT INTO memory_signatures
      (agent_id, topic_key, origin)
     VALUES
      ($1, $2, $3)`,
    [agentId, topicKeyValue, origin]
  );
}

// ---------------------------------------------------------------------------
// REJECTED TOPICS
// ---------------------------------------------------------------------------

const REJECTION_REASONS = [
  'avoid_list',
  'duplicate',
  'below_threshold',
  'invalid_output',
  'source_failure',
];

async function insertRejectedTopic(
  agentId,
  topic,
  reason,
  scores = null
) {
  if (!REJECTION_REASONS.includes(reason)) {
    throw new Error(`Invalid rejection reason: ${reason}`);
  }

  await db.query(
    `INSERT INTO rejected_topics
      (agent_id, topic, reason, scores)
     VALUES
      ($1, $2, $3, $4)`,
    [
      agentId,
      topic,
      reason,
      scores ? JSON.stringify(scores) : null,
    ]
  );
}

async function getRecentRejectedTopics(agentId, limit = 20) {
  const result = await db.query(
    `SELECT
       topic,
       reason,
       scores,
       created_at
     FROM rejected_topics
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, limit]
  );

  return result.rows;
}

// ---------------------------------------------------------------------------
// CYCLE RUNS
// ---------------------------------------------------------------------------

const CYCLE_OUTCOMES = [
  'in_progress',
  'published',
  'rejected_all',
  'source_failure',
  'llm_failure',
];

async function startCycleRun(agentId) {
  const result = await db.query(
    `INSERT INTO cycle_runs
      (agent_id, outcome)
     VALUES
      ($1, 'in_progress')
     RETURNING id`,
    [agentId]
  );

  return result.rows[0].id;
}

async function finishCycleRun(
  cycleRunId,
  outcome,
  detail
) {
  if (!CYCLE_OUTCOMES.includes(outcome)) {
    throw new Error(`Invalid cycle outcome: ${outcome}`);
  }

  await db.query(
    `UPDATE cycle_runs
     SET
       outcome = $1,
       detail = $2
     WHERE id = $3`,
    [
      outcome,
      detail || null,
      cycleRunId,
    ]
  );
}

async function getRecentCycleRuns(
  agentId,
  limit = 10
) {
  const result = await db.query(
    `SELECT
       id,
       started_at,
       outcome,
       detail
     FROM cycle_runs
     WHERE agent_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [agentId, limit]
  );

  return result.rows;
}

async function getLatestCycleRun(agentId) {
  const result = await db.query(
    `SELECT
       id,
       started_at,
       outcome,
       detail
     FROM cycle_runs
     WHERE agent_id = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [agentId]
  );

  return result.rows[0] || null;
}

/**
 * True if the most recent cycle_runs row for this agent
 * is still 'in_progress'.
 */
async function hasCycleInProgress(agentId) {
  const result = await db.query(
    `SELECT outcome
     FROM cycle_runs
     WHERE agent_id = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [agentId]
  );

  return (
    result.rows.length > 0 &&
    result.rows[0].outcome === 'in_progress'
  );
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  isValidUuid,

  // agents
  createAgent,
  getAgent,
  touchAgentLastRun,

  // posts
  insertPost,
  getPostsForAgent,
  getRecentPostTexts,
  getLatestPost,

  // memory
  getRecentSignatures,
  insertSignature,

  // rejected topics
  insertRejectedTopic,
  getRecentRejectedTopics,
  REJECTION_REASONS,

  // cycle runs
  startCycleRun,
  finishCycleRun,
  getRecentCycleRuns,
  getLatestCycleRun,
  hasCycleInProgress,
  CYCLE_OUTCOMES,
};