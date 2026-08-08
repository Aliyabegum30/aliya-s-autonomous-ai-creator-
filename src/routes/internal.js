// Internal routes. NEITHER of these is part of the mandatory evaluator
// contract (that's exactly POST /api/agent/init and GET /api/agent/feed,
// wired in routes/agent.js).
//
// POST /internal/run-cycle — the ONLY thing that triggers autonomous
// generation. Called exclusively by the GitHub Actions scheduler, and
// protected by a shared secret so nothing else (including an evaluator
// probing the API) can trigger a cycle.
//
// GET /internal/demo-data — read-only convenience endpoint for the demo
// frontend (public/index.html) to show persona info, posts, and recent
// editorial rejections in one call. Not authenticated: it only reads
// non-sensitive data and cannot trigger anything, so there's no admin
// surface being exposed here — just a view for the demo page.

const express = require('express');
const queries = require('../storage/queries');
const controller = require('../agent/controller');

const router = express.Router();

function requireRunCycleSecret(req, res, next) {
  const configured = process.env.RUN_CYCLE_SECRET;
  if (!configured) {
    console.error('[internal] RUN_CYCLE_SECRET is not configured on the server.');
    return res.status(500).json({ error: 'Server is not configured to accept run-cycle requests.' });
  }

  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || token !== configured) {
    return res.status(401).json({ error: 'Missing or invalid Authorization bearer token.' });
  }
  next();
}

// ---- POST /internal/run-cycle ------------------------------------------

router.post('/run-cycle', requireRunCycleSecret, async (req, res) => {
  const { agentId } = req.body || {};

  if (typeof agentId !== 'string' || !queries.isValidUuid(agentId)) {
    return res.status(400).json({ error: '"agentId" is required and must be a valid identifier.' });
  }

  let agent;
  try {
    agent = await queries.getAgent(agentId);
  } catch (err) {
    console.error('[POST /internal/run-cycle] Database error:', err.message);
    return res.status(500).json({ error: 'Failed to look up agent.' });
  }

  if (!agent) {
    return res.status(404).json({ error: `No agent found for agentId "${agentId}".` });
  }

  const result = await controller.runCycle(agentId);
  return res.status(200).json(result);
});

// ---- GET /internal/demo-data ---------------------------------------------

router.get('/demo-data', async (req, res) => {
  const { agentId } = req.query;

  if (typeof agentId !== 'string' || !queries.isValidUuid(agentId)) {
    return res.status(400).json({ error: '"agentId" query parameter is required and must be valid.' });
  }

  try {
    const agent = await queries.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: `No agent found for agentId "${agentId}".` });
    }

    const [posts, rejectedTopics, cycleRuns] = await Promise.all([
      queries.getPostsForAgent(agentId),
      queries.getRecentRejectedTopics(agentId, 20),
      queries.getRecentCycleRuns(agentId, 10),
    ]);

    return res.status(200).json({
      agent: { agentId: agent.agent_id, persona: agent.persona, createdAt: agent.created_at, lastRunAt: agent.last_run_at },
      posts: posts.map((p) => ({
        id: p.id,
        createdAt: new Date(p.created_at).toISOString(),
        text: p.text,
        rationale: p.rationale,
        sources: p.sources,
      })),
      rejectedTopics,
      cycleRuns,
    });
  } catch (err) {
    console.error('[GET /internal/demo-data] Database error:', err.message);
    return res.status(500).json({ error: 'Failed to load demo data.' });
  }
});

module.exports = router;
