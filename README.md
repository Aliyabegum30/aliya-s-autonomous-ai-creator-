# Postmortem Agent

An autonomous AI/technology persona built for the ABTalks Vibe Code
Hackathon (Problem Statement 3: "Autonomous AI Creator"). **Postmortem** is
a Production AI Failure Analyst: it independently discovers AI/tech topics
from Hacker News (with an RSS fallback), applies editorial judgment against
its own standards, writes in a consistent clinical incident-report voice,
remembers what it's already covered, and keeps publishing over time —
without further human instructions after initialization.

**Status: Steps 1–2 plus the full remaining system implemented in this
session.** Discovery, filtering, memory, editorial scoring, generation,
validation, storage, the scheduler-triggered internal endpoint, and a demo
frontend all exist now. See "What has and hasn't been verified" below for
exactly what was and wasn't tested with real network access.

## Architecture

```
Evaluator                          GitHub Actions (hourly, external)
   |                                        |
   +--> POST /api/agent/init                +--> POST /internal/run-cycle
   |        (creates the agent row,                (protected by RUN_CYCLE_SECRET)
   |         may kick off one                          |
   |         best-effort cycle)                         v
   |                                          Autonomous cycle (agent/controller.js):
   +--> GET /api/agent/feed                   DISCOVER -> NORMALIZE -> FILTER ->
            (STRICTLY READ-ONLY,               MEMORY CHECK -> EDITORIAL JUDGMENT ->
             never generates,                  SELECT -> GENERATE -> VALIDATE -> STORE
             never calls the LLM)                        |
            |                                             v
            v                                       PostgreSQL (Neon)
       PostgreSQL (Neon)
```

`GET /api/agent/feed` only ever runs `SELECT` queries. The only thing that
triggers generation is `POST /internal/run-cycle`, which is not part of the
evaluator-facing contract and is called exclusively by the GitHub Actions
workflow in `.github/workflows/agent-cycle.yml`.

## The autonomous cycle

Implemented in `src/agent/controller.js`, orchestrating:

1. **Discover** (`agent/discovery.js`) — Hacker News Firebase API (top
   stories + item lookups), with a small curated RSS bundle as fallback if
   HN is unreachable, empty, or malformed.
2. **Normalize** — candidates are shaped to
   `{ title, url, snippet, publishedAt, sourceName }`; malformed ones
   (no title/url) are dropped in discovery.js itself.
3. **Deterministic filter** (`agent/filter.js`) — avoid-list keywords
   (funding, valuation, celebrity drama, hype language, etc., from the
   persona definition) and a freshness cutoff, before any LLM call is spent.
4. **Memory check** (`agent/memory.js`) — exact and near-duplicate
   detection against `memory_signatures`, using deterministic
   keyword-signature Jaccard similarity (no vector database).
5. **Editorial judgment** (`agent/editorial.js`) — Gemini scores surviving
   candidates on relevance/timeliness/technical significance/originality/
   persona alignment/usefulness and returns an accept/reject decision per
   candidate. A candidate must be both LLM-accepted AND clear a numeric
   average-score floor to survive — the LLM is expected to reject things,
   and does.
6. **Select** — the strongest surviving candidate by average editorial
   score.
7. **Generate** (`agent/generator.js`) — Gemini writes `{ text, rationale }`
   in the Postmortem voice, grounded strictly in the discovered
   title/url/snippet. The rationale explicitly covers why the topic was
   selected, why it's relevant now, and why it beat the alternatives.
8. **Validate** (`agent/validator.js`) — non-empty text/rationale, a valid
   source URL that matches what was actually discovered (a basic
   groundedness check), a valid ISO 8601 UTC timestamp, and a near-duplicate
   check against recently published text.
9. **Store** — insert into `posts`, record the topic signature as
   `published` in `memory_signatures`, update `agents.last_run_at`.
10. **Complete** — every cycle, regardless of outcome, writes exactly one
    row to `cycle_runs` (`published`, `rejected_all`, `source_failure`, or
    `llm_failure`). "Everything got rejected" and "the source was down" are
    both valid, non-crashing outcomes — the process never crashes because
    nothing was worth publishing.

Every rejected candidate at every stage is written to `rejected_topics`
with a reason, so editorial decision-making is visible, not just asserted.

## Prerequisites

- Node.js 18 or later
- A PostgreSQL database (a free hosted instance on
  [Neon](https://neon.tech) or [Supabase](https://supabase.com) is
  recommended; a local Postgres also works)
- A [Gemini API key](https://aistudio.google.com/apikey) (free tier)
- Optionally, a [Groq API key](https://console.groq.com/keys) as an LLM
  fallback

## Local setup

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL, RUN_CYCLE_SECRET, GEMINI_API_KEY (GROQ_API_KEY optional)
npm run migrate
npm run db:check
npm start
```

`npm run migrate` applies `src/storage/schema.sql` (safe to re-run — every
statement uses `IF NOT EXISTS`), creating five tables: `agents`, `posts`,
`memory_signatures`, `rejected_topics`, `cycle_runs`. **The schema was not
modified in this session** — the existing Step 1 design was sufficient for
everything above.

`npm run db:check` confirms the connection works and lists existing tables.

`npm start` runs the server on `PORT` (default `3000`).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Neon/Supabase recommended) |
| `RUN_CYCLE_SECRET` | yes | Bearer token required by `POST /internal/run-cycle` |
| `GEMINI_API_KEY` | yes | Primary LLM for editorial scoring + generation |
| `GROQ_API_KEY` | no | Fallback LLM, used only if Gemini fails |
| `GEMINI_MODEL` | no | Override the default Gemini model id |
| `GROQ_MODEL` | no | Override the default Groq model id |
| `PORT` | no | Local server port (default `3000`) |

`.env` is gitignored and must never be committed. Never hardcode any of
these values in source.

## API

### `POST /api/agent/init` (evaluator-facing, mandatory)

```bash
curl -X POST http://localhost:3000/api/agent/init \
  -H "Content-Type: application/json" \
  -d '{"persona": {"name": "Postmortem", "domain": "Production AI Failure Analysis"}}'
```

Returns `201 { "agentId": "<uuid>" }`, or `400 { "error": "..." }` if
`persona`, `persona.name`, or `persona.domain` is missing/invalid. Creates
one row in `agents` and — best-effort, not awaited, never blocking the
response — kicks off one initial cycle so the feed isn't empty for the
entire first scheduler interval. All later cycles come from GitHub Actions.

### `GET /api/agent/feed?agentId=...` (evaluator-facing, mandatory, read-only)

```bash
curl "http://localhost:3000/api/agent/feed?agentId=<uuid>"
```

Returns `200 { "posts": [...] }`, newest first, or `{ "posts": [] }` if
none yet. `400` for a missing/malformed `agentId`, `404` for a well-formed
but unknown one. This route runs `SELECT` only — it never generates, never
calls an LLM, never writes anything.

### `POST /internal/run-cycle` (internal only, NOT evaluator-facing)

```bash
curl -X POST http://localhost:3000/internal/run-cycle \
  -H "Authorization: Bearer $RUN_CYCLE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"agentId": "<uuid>"}'
```

Requires `Authorization: Bearer <RUN_CYCLE_SECRET>`. `401` without a valid
secret, `404` for an unknown agent, otherwise runs one full cycle and
returns its outcome, e.g. `{ "outcome": "published", "postId": "..." }` or
`{ "outcome": "rejected_all", "detail": "..." }`. This is the ONLY thing
that triggers autonomous generation — called exclusively by GitHub Actions.

### Running a cycle manually (without curl / a running server)

```bash
node scripts/run-cycle-manual.js <agentId>
```

Connects directly to `DATABASE_URL` and runs exactly one cycle, printing the
result. Useful for local end-to-end testing before wiring up the scheduler.

## Demo frontend

A read-only page at `/` (served from `public/`) shows the persona identity,
mission, the live feed for a given `agentId`, and — for judging
transparency, not as part of the evaluator API — recently rejected topics
and recent cycle outcomes, via a non-mutating `GET /internal/demo-data`
endpoint. Paste an `agentId` and click "Load feed".

## GitHub Actions scheduler

`.github/workflows/agent-cycle.yml` runs on an approximately-hourly cron
(GitHub's scheduler is best-effort, not exact) and supports
`workflow_dispatch` for manual runs. It calls `POST /internal/run-cycle` on
your deployed app.

Required **repository secrets** (Settings → Secrets and variables →
Actions):

| Secret | Value |
|---|---|
| `APP_BASE_URL` | Your deployed Render URL, e.g. `https://postmortem-agent.onrender.com` |
| `RUN_CYCLE_SECRET` | Same value as the server's `RUN_CYCLE_SECRET` env var |
| `AGENT_ID` | The `agentId` returned by your one `POST /api/agent/init` call |

This is deliberately an external scheduler, not an in-process
`setInterval` — autonomy has to survive the app process being asleep,
restarted, or redeployed, and it has to work whether or not the evaluator
is ever polling `/feed`.

## Deployment (Render)

1. Push this repo to GitHub (already done for Step 1/2).
2. In Render: New → Web Service → connect the repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Add environment variables: `DATABASE_URL`, `RUN_CYCLE_SECRET`,
     `GEMINI_API_KEY`, `GROQ_API_KEY` (optional).
3. Once deployed, call `POST /api/agent/init` once against the live URL to
   create the agent and get its `agentId`.
4. Add `APP_BASE_URL`, `RUN_CYCLE_SECRET`, `AGENT_ID` as GitHub repository
   secrets (see above) so the Actions workflow can reach the deployed app.
5. Optionally trigger the workflow manually once (`workflow_dispatch`) to
   confirm the scheduler path works end-to-end before waiting for the next
   hourly run.

## Testing

```bash
npm test
```

Runs `node --test test/` — Node's built-in test runner, no extra
dependencies. Covers:

- Pure logic: topic-signature similarity, deterministic avoid-list/
  freshness filtering, RSS/Atom parsing, editorial score validation,
  post validation (including the groundedness and near-duplicate checks).
- The full pipeline (`controller.runCycle`) with discovery/editorial/
  generator/database all mocked: a fully successful publish, a source
  failure, an editorial rejection of everything, a duplicate-memory
  rejection alongside a surviving candidate, an LLM failure, and the
  in-progress overlap guard.
- The two evaluator routes and the internal route against the real Express
  app, with the database and cycle runner mocked: valid/invalid `init`,
  missing/malformed/unknown `agentId` on `feed`, feed ordering and shape,
  and auth/lookup/success paths on `run-cycle`.

### What has and hasn't been verified

This session was built in a sandboxed environment with **no network
access** (`npm install`, Hacker News, Neon, and Gemini were all
unreachable from here). Everything above was written and unit/integration
tested with the real Postgres/HTTP dependencies mocked out — that
confirms the pipeline's logic and control flow, but it is **not** the same
as a live run. I have not personally verified against a real network:

- A real `npm install` succeeding with these exact dependency versions.
- A live Hacker News discovery call, or the RSS fallback against real feeds.
- A real Gemini (or Groq) API call succeeding with the prompts in
  `editorial.js` / `generator.js`, including that `GEMINI_MODEL`'s default
  (`gemini-2.0-flash`) is still current — verify against Google's docs
  before relying on it.
- An actual write to a real Neon/Supabase database.
- The GitHub Actions workflow actually firing on schedule.
- The full 48-hour autonomous behavior end-to-end.

**Before you trust this for the hackathon, run this manual procedure**
against your real Neon database and API keys:

```bash
npm install
cp .env.example .env   # fill in real values
npm run migrate
npm run db:check
npm start                                    # in one terminal
curl -X POST http://localhost:3000/api/agent/init \
  -H "Content-Type: application/json" \
  -d '{"persona": {"name": "Postmortem", "domain": "Production AI Failure Analysis"}}'
# copy the returned agentId, then:
node scripts/run-cycle-manual.js <agentId>
curl "http://localhost:3000/api/agent/feed?agentId=<agentId>"
```

If `run-cycle-manual.js` reports `outcome: "published"`, the feed call
should now return one post. If it reports `rejected_all` or
`source_failure`, that's a valid outcome too — check the printed detail
and, if needed, `cycle_runs`/`rejected_topics` in the database directly to
see why.

## Project structure

```
/src
  app.js               -- Express app: wires routes + static demo frontend
  server.js             -- starts the app on PORT
  /routes
    agent.js             -- POST /api/agent/init, GET /api/agent/feed (mandatory contract)
    internal.js           -- POST /internal/run-cycle, GET /internal/demo-data
  /agent
    controller.js          -- orchestrates the full 10-step cycle
    discovery.js            -- STEP 1+2: Hacker News + RSS fallback, normalize
    filter.js                -- STEP 3: deterministic avoid-list/freshness filter
    memory.js                  -- STEP 4: duplicate/near-duplicate check
    editorial.js                -- STEP 5: LLM editorial scoring
    generator.js                  -- STEP 7: LLM post generation
    validator.js                   -- STEP 8: pre-store validation
  /persona
    postmortem.js                   -- single source of truth for the persona
  /storage
    schema.sql                       -- table definitions (unchanged from Step 1)
    db.js                             -- shared PostgreSQL connection pool
    queries.js                         -- all SQL against the 5 tables
  /utils
    http.js                             -- fetch with timeout
    similarity.js                        -- topic-key + Jaccard similarity
    llm.js                                -- Gemini primary / Groq fallback wrapper
/public
  index.html, style.css, app.js          -- read-only demo frontend
/scripts
  migrate.js, check-db.js                -- from Step 1
  run-cycle-manual.js                     -- run one cycle locally without curl
/test
  *.test.js                                -- node:test, no extra dependencies
/.github/workflows
  agent-cycle.yml                          -- GitHub Actions scheduler
.env.example
.gitignore
PROMPTS.md
README.md
```

## Limitations / known gaps

- The RSS fallback feed list is small and hand-picked; verify the feeds
  are still live before depending on the fallback path.
- Editorial scoring batches up to 10 candidates per Gemini call to bound
  cost; this is a simple cap, not adaptive.
- The demo frontend is intentionally minimal — a viewer, not a product.
- No automated test exercises a real LLM response's exact JSON shape end
  to end (only the parsing/validation logic around it); a live key is
  required to confirm that fully.
