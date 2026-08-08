# PROMPTS.md — AI Usage Log

This log records meaningful AI-assisted development sessions with Claude for
the Postmortem Agent hackathon project. Entries are added as development
happens, not written retroactively. Nothing below is fabricated — each entry
reflects an actual prompt from this conversation.

---

## Session 1 — Requirement analysis

### Prompt
A detailed hackathon-partner instruction set establishing working rules
(analyze before coding, don't invent requirements, prioritize simplicity),
followed by the full ABTalks "Autonomous AI Creator" problem statement, and
a request for a Phase 1 requirement analysis covering: mandatory
requirements, evaluation-critical requirements, API contract, data
requirements, autonomous behavior, failure cases, out-of-scope items, and a
Definition of Done.

### Purpose
Establish a shared, precise understanding of the hackathon requirements
before any design or code decisions were made.

### Result
Produced a full Phase 1 analysis: mandatory requirements list, the exact
`POST /api/agent/init` / `GET /api/agent/feed` contract, data/persistence
requirements, explicit autonomous-behavior constraints (nothing may depend
on another request after init), failure-case handling, out-of-scope
features, and a Definition of Done checklist. No code written.

### Human Decision
Approved. Asked for a deployment recommendation and the full architecture
(Phases 2–13) before any implementation.

---

## Session 2 — Deployment comparison and full architecture

### Prompt
Requested a comparison of three deployment approaches (Render/Railway/Fly
with an in-process scheduler; Vercel/serverless with an external scheduler;
any other genuinely better option), followed by the complete architecture,
data model, autonomous loop, persona proposal, editorial scoring design,
memory strategy, live discovery design, LLM comparison, API contract
confirmation, and demonstration UI plan.

### Purpose
Lock in the deployment model and full system design before writing any
code, since the deployment choice determines whether autonomy after `init`
is genuine or fragile.

### Result
Compared current (2026) free-tier behavior across Render, Railway, Fly.io,
and Vercel (verified via web search, since free-tier terms change often).
Recommended a hybrid: Render (free, long-running Express app) + GitHub
Actions as an external scheduler + hosted Postgres — because it keeps
autonomy genuinely decoupled from both the app process and the evaluator's
requests, without relying on a free tier that no longer reliably exists.
Produced the full architecture, data model, autonomous loop stages, a first
persona draft, editorial scoring design, memory strategy (keyword-signature
similarity, no vector DB), live discovery plan (Hacker News API + RSS
fallback), and a runtime LLM comparison (Gemini primary, Groq fallback). No
code written.

### Human Decision
Approved the direction, then asked for a more concise, decision-oriented
finalization pass before coding.

---

## Session 3 — Concise final architecture decisions

### Prompt
Asked for a shortened, decision-only pass covering: deployment choice,
scheduler mechanics, persistence choice, runtime LLM choice, live discovery
source, one combined architecture diagram, top 5 risks with mitigations,
and an 8–12 step implementation order — explicitly without repeating
earlier requirement explanations.

### Purpose
Convert the full design into a crisp, unambiguous final decision set ready
to implement against.

### Result
Finalized: Render + GitHub Actions (hourly-ish) as the scheduler, hosted
Postgres, Gemini primary / Groq fallback, Hacker News API + RSS fallback,
a single combined architecture diagram, a 5-item risk register, and a
12-step implementation order.

### Human Decision
Approved with two modifications: (1) use an approximately hourly GitHub
Actions schedule specifically, not an in-process timer under any
circumstance; (2) treat `POST /internal/run-cycle` strictly as a protected
internal route, separate from the evaluator-facing contract, with
`GET /api/agent/feed` remaining strictly read-only. Also requested 3
persona options (avoiding generic "AI analyst" personas) before coding.

---

## Session 4 — Persona proposal and design finalization

### Prompt
Requested three distinctive, non-generic AI/technology personas (each with
name, domain, audience, mission, tone, editorial beliefs, followed/rejected
topics, and example opinions), a recommendation of one, and the final
simplified architecture, autonomous cycle, database tables, and
implementation order incorporating the Session 3 modifications.

### Purpose
Give the agent a genuine, defensible editorial point of view (not a news
summarizer) and lock the design that implementation would follow.

### Result
Proposed three personas: "Postmortem" (production AI failure analyst),
"Open Weights" (open-source accountability), and "Signal Loss" (applied
systems reality-check). Recommended "Postmortem" for having the sharpest,
most consistently applicable editorial test and the least risk of drifting
into generic AI-commentary voice. Finalized the two-path architecture
diagram (evaluator-facing vs. autonomous), the 10-stage autonomous cycle,
the five database tables, and a 12-step implementation order.

### Human Decision
Approved the persona and full design. Requested two further constraints
before coding: (1) no `/admin` API endpoint — editorial rejections surface
in the demo UI later, not as a separate API surface; (2) reconfirmed
`GET /api/agent/feed` must never trigger generation under any
circumstance. Instructed to begin implementation, Step 1 only.

---

## Session 5 — Step 1 implementation: repo, environment, schema

### Prompt
Instructed to implement Step 1 only: project structure, `.env.example`,
`.gitignore`, the PostgreSQL schema/migration for `agents`, `posts`,
`memory_signatures`, `rejected_topics`, `cycle_runs`, a minimal database
connection layer, and a basic `README.md` — explicitly no agent loop, no
LLM integration, no topic discovery, and no frontend yet. Also requested
this file be created now with only real prompts recorded so far.

### Purpose
Stand up the foundation (structure, config, persistence layer) that every
later step builds on, without getting ahead of the approved step-by-step
order.

### Result
Created `package.json` (dependencies: `pg`, `dotenv` only), `.env.example`,
`.gitignore`, `src/storage/schema.sql` (five tables per the approved data
model), `src/storage/db.js` (shared connection pool), `scripts/migrate.js`
and `scripts/check-db.js`, `README.md`, and this file.

### Human Decision
Approved. Proceeded to Step 2.

---

## Session 6 — Step 2 implementation: POST /api/agent/init

### Prompt
Handoff instructions for a new session taking over the existing project
(attached as a ZIP): inspect the current Step 1 files first, confirm they
match the described state, then implement Step 2 only —
`POST /api/agent/init` — with input validation, a generated `agentId`
persisted to the `agents` table via the existing `src/storage/db.js`, and
safe database-error handling. Explicitly out of scope for this step:
`GET /api/agent/feed`, the autonomous loop, topic discovery, LLM
integration, GitHub Actions, deployment, frontend, and any extra
architecture.

### Purpose
Stand up the minimal evaluator-facing `init` endpoint on top of the
existing Step 1 schema/connection layer, without getting ahead of the
approved step-by-step order.

### Result
Inspected the attached ZIP and confirmed it matched the Step 1 description
(package.json with only `pg`/`dotenv`, `.env.example`, `.gitignore`,
`src/storage/schema.sql`, `src/storage/db.js`, `scripts/migrate.js`,
`scripts/check-db.js`, `README.md`, `PROMPTS.md`) with no discrepancies.
Added `express` as a dependency and an `npm start` script. Created
`src/app.js` (Express app, JSON body parsing, `POST /api/agent/init` with
validation of `persona.name`/`persona.domain`, an `INSERT` into `agents`
using the existing `query()` helper, and try/catch error handling returning
a 500 on database failure) and `src/server.js` (binds the app to a port).
Did not modify the database schema or touch any Step 3+ concerns.

### Human Decision
Approved. Proceeded to implement the full remaining system in one session
(see Session 7).

---

## Session 7 — Full remaining system: discovery, editorial judgment, memory,
generation, scheduler endpoint, frontend, tests, docs

### Prompt
Handoff instructions confirming the verified Step 1+2 state (Neon
connected, migration applied, a real agent persisted via
`POST /api/agent/init`), then instructing implementation of the entire
remaining system in one batch without stopping for approval between
sub-steps: the full DISCOVER→NORMALIZE→FILTER→MEMORY CHECK→EDITORIAL
JUDGMENT→SELECT→GENERATE→VALIDATE→STORE→COMPLETE pipeline; `GET
/api/agent/feed` (strictly read-only); the protected
`POST /internal/run-cycle` endpoint; a GitHub Actions hourly scheduler
workflow; a read-only demo frontend; practical tests; and updated
README/PROMPTS/.env.example — using the existing database, LLM (Gemini
primary, Groq fallback), and discovery source (Hacker News + RSS fallback)
choices already locked in earlier sessions, without redesigning the schema
or introducing new infrastructure.

### Purpose
Complete the hackathon submission's core autonomy requirement: a system
that discovers topics, exercises real editorial judgment (including
rejecting things), remembers what it has covered, and keeps publishing on
a schedule that runs independently of the evaluator's `GET /feed` polling.

### Result
Implemented, in `src/agent/`: `discovery.js` (Hacker News Firebase API
primary, small curated RSS/Atom fallback via a dependency-free parser,
concurrency-limited item fetching, timeout-protected HTTP throughout),
`filter.js` (deterministic avoid-list keyword + freshness filter before
any LLM call), `memory.js` (exact + Jaccard-similarity near-duplicate
detection against `memory_signatures`, no vector database), `editorial.js`
(batched Gemini structured-JSON scoring across six dimensions with a
numeric-floor-plus-LLM-boolean acceptance rule), `generator.js`
(Gemini-generated post text + rationale grounded strictly in the
discovered source), `validator.js` (non-empty fields, valid ISO 8601 UTC
timestamp, a groundedness check that the actually-discovered URL appears
in sources, near-duplicate-text rejection against recent posts), and
`controller.js` (orchestrates all ten steps, with a per-stage try/catch so
every documented failure mode — source down, all rejected, LLM failure —
ends the cycle with a recorded `cycle_runs` outcome instead of crashing,
plus an overlap guard against a still-`in_progress` prior cycle).

Added `src/utils/http.js` (AbortController-based timeout wrapper),
`src/utils/similarity.js` (topic-key + Jaccard similarity — caught and
fixed a real bug here during testing: the original tokenizer dropped all
2-letter words, which silently stripped "AI" out of every topic
signature), `src/utils/llm.js` (Gemini primary / Groq fallback, JSON
parsing with markdown-fence stripping), and `src/persona/postmortem.js`
(single source of truth for the persona's voice, beliefs, and avoid-list,
consumed by filter/editorial/generator instead of each duplicating it).

Added `src/storage/queries.js` centralizing all SQL against the five
existing tables — did not modify `schema.sql`, per the constraint that the
existing design was already sufficient.

Added `src/routes/agent.js` (rewriting `POST /api/agent/init` to persist
via the new queries module and fire a best-effort, non-blocking initial
cycle after responding; `GET /api/agent/feed` validating `agentId` shape,
404 for unknown agents, strictly read-only) and `src/routes/internal.js`
(`POST /internal/run-cycle` behind a `Bearer RUN_CYCLE_SECRET` check,
looking up the agent before running a cycle; `GET /internal/demo-data`, an
unauthenticated but strictly read-only endpoint for the demo page to show
persona/posts/rejected-topics/cycle-runs together — kept outside the
evaluator contract per the earlier "no `/admin` API endpoint" constraint).
Rewrote `src/app.js` to wire both route modules plus `express.static` for
the demo frontend and a `/health` check.

Built the demo frontend (`public/index.html`, `style.css`, `app.js`): a
read-only page taking a pasted `agentId`, showing persona identity/mission,
the live feed via the real `GET /api/agent/feed`, and editorial
transparency (recent rejections and cycle outcomes) via
`GET /internal/demo-data`. Added `.github/workflows/agent-cycle.yml`
(hourly cron + `workflow_dispatch`, calling `POST /internal/run-cycle`
with three required repository secrets: `APP_BASE_URL`,
`RUN_CYCLE_SECRET`, `AGENT_ID`).

Added `test/*.test.js` using Node's built-in `node:test` runner (no new
dependencies): pure-logic tests for similarity, the deterministic filter,
the RSS/Atom parser, editorial score validation, and post validation; full
pipeline tests for `controller.runCycle` with every dependency
(discovery/memory/editorial/generator/database) mocked, covering a
successful publish, a source failure, an all-rejected editorial outcome, a
duplicate-memory rejection alongside a surviving candidate, an LLM
failure, and the in-progress overlap guard; and route-level tests against
the real Express app with the database and cycle runner mocked, covering
valid/invalid `init`, missing/malformed/unknown `agentId` on `feed`, feed
ordering and response shape, and the auth/lookup/success paths on
`run-cycle`. Ran the full suite (48 tests) to a clean pass.

This development sandbox has no network access — `npm install`,
`hacker-news.firebaseio.com`, Neon, and the Gemini/Groq APIs were all
unreachable from here (confirmed directly: a `curl` to the Hacker News API
returned an `x-deny-reason: host_not_allowed` proxy error, and `npm
install` returned 403s against the npm registry). To still exercise
`controller.test.js` and `routes.test.js` — which require `pg`, `dotenv`,
and `express` to be resolvable — minimal hand-written stand-ins for those
three packages were placed in `node_modules/` temporarily, used only to
run the offline test suite in this sandbox, and deleted before packaging
the final deliverable; they are not part of what was handed back, and
`npm install` fetches the real packages. While building the Express
stand-in, its first version didn't support middleware chains
(`router.post(path, authMiddleware, handler)`), which surfaced as one
failing test; fixed the stand-in (not application code) once traced. Did
not fabricate a live end-to-end run — README.md explicitly lists what was
and wasn't verified against real infrastructure, with a manual verification
procedure for the person to run against their real Neon/Gemini credentials.

Updated `README.md` (architecture, full API reference, environment
variables, local setup, deployment steps, GitHub Actions secrets, testing
section with an explicit "what has and hasn't been verified" disclosure,
project structure, known limitations) and `.env.example` (comments
reflecting the completed system rather than the Step 1 placeholder note).

### Human Decision
Pending review.
