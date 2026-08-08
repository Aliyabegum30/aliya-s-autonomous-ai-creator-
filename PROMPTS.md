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
Pending review.
