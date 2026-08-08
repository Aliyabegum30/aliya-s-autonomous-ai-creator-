// The ONLY two evaluator-facing endpoints in the mandatory contract:
//   POST /api/agent/init
//   GET  /api/agent/feed
//
// GET /api/agent/feed is strictly read-only — it must never call the LLM,
// never call discovery, never write to the database, and never trigger a
// cycle. It only ever runs SELECT queries.

const express = require('express');
const queries = require('../storage/queries');
const controller = require('../agent/controller');

const router = express.Router();

// ---- POST /api/agent/init ------------------------------------------------

router.post('/agent/init', async (req, res) => {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }

  const { persona } = body;

  if (!persona || typeof persona !== 'object') {
    return res.status(400).json({ error: '"persona" is required and must be an object.' });
  }

  const { name, domain } = persona;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: '"persona.name" is required and must be a non-empty string.' });
  }

  if (typeof domain !== 'string' || domain.trim().length === 0) {
    return res.status(400).json({ error: '"persona.domain" is required and must be a non-empty string.' });
  }

  let agent;
  try {
    agent = await queries.createAgent({ name: name.trim(), domain: domain.trim() });
  } catch (err) {
    console.error('[POST /api/agent/init] Database error:', err.message);
    return res.status(500).json({ error: 'Failed to create agent. Please try again.' });
  }

  // Respond immediately — the API response must never depend on the LLM
  // completing. Future cycles are driven by GitHub Actions calling
  // POST /internal/run-cycle; this is only a best-effort head start so the
  // feed isn't empty for the entire first scheduler interval.
  res.status(201).json({ agentId: agent.agent_id });

  controller.runCycle(agent.agent_id).catch((err) => {
    console.error(`[POST /api/agent/init] Best-effort initial cycle failed for ${agent.agent_id}:`, err.message);
  });
});

// ---- GET /api/agent/feed --------------------------------------------------

router.get('/agent/feed', async (req, res) => {
  const { agentId } = req.query;

  if (typeof agentId !== 'string' || agentId.trim().length === 0) {
    return res.status(400).json({ error: '"agentId" query parameter is required.' });
  }

  if (!queries.isValidUuid(agentId)) {
    return res.status(400).json({ error: '"agentId" is not a valid identifier.' });
  }

  let agent;
  try {
    agent = await queries.getAgent(agentId);
  } catch (err) {
    console.error('[GET /api/agent/feed] Database error:', err.message);
    return res.status(500).json({ error: 'Failed to read feed. Please try again.' });
  }

  if (!agent) {
    return res.status(404).json({ error: `No agent found for agentId "${agentId}".` });
  }

  let rows;
  try {
    rows = await queries.getPostsForAgent(agentId);
  } catch (err) {
    console.error('[GET /api/agent/feed] Database error:', err.message);
    return res.status(500).json({ error: 'Failed to read feed. Please try again.' });
  }

  const posts = rows.map((row) => ({
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    text: row.text,
    rationale: row.rationale,
    sources: Array.isArray(row.sources) ? row.sources : [],
  }));

  return res.status(200).json({ posts });
});

module.exports = router;
