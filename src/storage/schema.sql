-- Postmortem Agent — PostgreSQL schema
-- Applies the five tables approved in the architecture:
-- agents, posts, memory_signatures, rejected_topics, cycle_runs
--
-- Safe to re-run: every statement uses IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- provides gen_random_uuid()

-- One row per initialized agent. Created once by POST /api/agent/init.
CREATE TABLE IF NOT EXISTS agents (
  agent_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ
);

-- Published posts. This is exactly what GET /api/agent/feed reads and returns.
CREATE TABLE IF NOT EXISTS posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  text        TEXT NOT NULL,
  rationale   TEXT NOT NULL,
  sources     JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_key   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_agent_created ON posts (agent_id, created_at DESC);

-- Normalized topic signatures used for duplicate/near-duplicate detection.
-- Populated for both published posts and rejected topics.
CREATE TABLE IF NOT EXISTS memory_signatures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  topic_key   TEXT NOT NULL,
  origin      TEXT NOT NULL CHECK (origin IN ('published', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_agent_created ON memory_signatures (agent_id, created_at DESC);

-- Every topic the editorial pipeline explicitly rejected, and why.
-- Not exposed via the required API — used for the later demo UI.
CREATE TABLE IF NOT EXISTS rejected_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  reason      TEXT NOT NULL CHECK (
                reason IN ('avoid_list', 'duplicate', 'below_threshold', 'invalid_output', 'source_failure')
              ),
  scores      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rejected_agent_created ON rejected_topics (agent_id, created_at DESC);

-- Audit trail of every autonomous cycle triggered by GitHub Actions via
-- POST /internal/run-cycle. Doubles as scheduler state and overlap guard
-- (an 'in_progress' row lets a new cycle detect and skip a still-running one).
CREATE TABLE IF NOT EXISTS cycle_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome     TEXT NOT NULL CHECK (
                outcome IN ('in_progress', 'published', 'rejected_all', 'source_failure', 'llm_failure')
              ),
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_cycle_runs_agent_started ON cycle_runs (agent_id, started_at DESC);
