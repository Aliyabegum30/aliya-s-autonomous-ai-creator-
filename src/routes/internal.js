// Internal routes.
//
// These endpoints are NOT part of the mandatory evaluator contract.
// The mandatory evaluator endpoints are:
//
//   POST /api/agent/init
//   GET  /api/agent/feed
//
// POST /internal/run-cycle
//   Protected endpoint used by the autonomous scheduler.
//   It is the only endpoint that directly triggers an agent cycle.
//
// GET /internal/demo-data
//   Read-only endpoint used by the demo UI.
//   It exposes persona information, published posts,
//   recent rejected topics, and cycle history.
//
// IMPORTANT:
// The evaluator must never need to call /internal/run-cycle.
// Autonomous scheduling is responsible for calling it automatically.

const express = require('express');
const queries = require('../storage/queries');
const controller = require('../agent/controller');

const router = express.Router();

// ---------------------------------------------------------------------------
// RUN-CYCLE AUTHENTICATION
// ---------------------------------------------------------------------------

function requireRunCycleSecret(req, res, next) {
  const configuredSecret = process.env.RUN_CYCLE_SECRET;

  if (!configuredSecret) {
    console.error(
      '[internal] RUN_CYCLE_SECRET is not configured on the server.'
    );

    return res.status(500).json({
      error: 'Server is not configured to accept run-cycle requests.',
    });
  }

  const authorization = req.get('authorization') || '';

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || token !== configuredSecret) {
    return res.status(401).json({
      error: 'Missing or invalid Authorization bearer token.',
    });
  }

  return next();
}

// ---------------------------------------------------------------------------
// POST /internal/run-cycle
// ---------------------------------------------------------------------------
//
// This endpoint triggers exactly one autonomous agent cycle.
//
// Expected body:
//
// {
//   "agentId": "uuid"
// }
//
// The endpoint is intentionally protected by RUN_CYCLE_SECRET.
//
// The evaluator does NOT need to call this endpoint.
// GitHub Actions / the autonomous scheduler should call it instead.
// ---------------------------------------------------------------------------

router.post(
  '/run-cycle',
  requireRunCycleSecret,
  async (req, res) => {
    const { agentId } = req.body || {};

    if (
      typeof agentId !== 'string' ||
      !queries.isValidUuid(agentId)
    ) {
      return res.status(400).json({
        error:
          '"agentId" is required and must be a valid identifier.',
      });
    }

    let agent;

    try {
      agent = await queries.getAgent(agentId);
    } catch (err) {
      console.error(
        '[POST /internal/run-cycle] Database error:',
        err.message
      );

      return res.status(500).json({
        error: 'Failed to look up agent.',
      });
    }

    if (!agent) {
      return res.status(404).json({
        error: `No agent found for agentId "${agentId}".`,
      });
    }

    try {
      const result = await controller.runCycle(agentId);

      return res.status(200).json(result);
    } catch (err) {
      // controller.runCycle() normally handles its own expected
      // failures. This is an additional safety boundary so an
      // unexpected error never crashes the HTTP server.

      console.error(
        '[POST /internal/run-cycle] Cycle error:',
        err
      );

      return res.status(500).json({
        error: 'Autonomous cycle failed unexpectedly.',
        detail:
          process.env.NODE_ENV === 'production'
            ? undefined
            : err.message,
      });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /internal/demo-data
// ---------------------------------------------------------------------------
//
// Read-only endpoint for the demo frontend.
//
// It NEVER:
//   - calls the LLM
//   - discovers topics
//   - runs an autonomous cycle
//   - modifies the database
//
// It only performs SELECT-style queries.
// ---------------------------------------------------------------------------

router.get('/demo-data', async (req, res) => {
  const { agentId } = req.query;

  if (
    typeof agentId !== 'string' ||
    !queries.isValidUuid(agentId)
  ) {
    return res.status(400).json({
      error:
        '"agentId" query parameter is required and must be valid.',
    });
  }

  try {
    const agent = await queries.getAgent(agentId);

    if (!agent) {
      return res.status(404).json({
        error: `No agent found for agentId "${agentId}".`,
      });
    }

    const [
      posts,
      rejectedTopics,
      cycleRuns,
    ] = await Promise.all([
      queries.getPostsForAgent(agentId),
      queries.getRecentRejectedTopics(agentId, 20),
      queries.getRecentCycleRuns(agentId, 10),
    ]);

    return res.status(200).json({
      agent: {
        agentId: agent.agent_id,
        persona: agent.persona,
        createdAt: new Date(agent.created_at).toISOString(),
        lastRunAt: agent.last_run_at
          ? new Date(agent.last_run_at).toISOString()
          : null,
      },

      posts: posts.map((post) => ({
        id: post.id,
        createdAt: new Date(post.created_at).toISOString(),
        text: post.text,
        rationale: post.rationale,
        sources: Array.isArray(post.sources)
          ? post.sources
          : [],
      })),

      rejectedTopics: rejectedTopics.map((item) => ({
        topic: item.topic,
        reason: item.reason,
        scores: item.scores,
        createdAt: new Date(item.created_at).toISOString(),
      })),

      cycleRuns: cycleRuns.map((cycle) => ({
        id: cycle.id,
        startedAt: new Date(cycle.started_at).toISOString(),
        outcome: cycle.outcome,
        detail: cycle.detail,
      })),
    });
  } catch (err) {
    console.error(
      '[GET /internal/demo-data] Database error:',
      err.message
    );

    return res.status(500).json({
      error: 'Failed to load demo data.',
    });
  }
});

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

module.exports = router;