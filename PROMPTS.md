# PROMPTS.md — AI Usage Log

This log records meaningful AI-assisted development sessions with Claude for the Postmortem Agent hackathon project. Entries are added as development happens, not written retroactively. Nothing below is fabricated — each entry reflects an actual prompt, debugging exchange, implementation decision, or verification step from the development process.

---

## Session 1 — Requirement analysis

### Prompt

A detailed hackathon-partner instruction set establishing working rules (analyze before coding, don't invent requirements, prioritize simplicity), followed by the full ABTalks "Autonomous AI Creator" problem statement, and a request for a Phase 1 requirement analysis covering: mandatory requirements, evaluation-critical requirements, API contract, data requirements, autonomous behavior, failure cases, out-of-scope items, and a Definition of Done.

### Purpose

Establish a shared, precise understanding of the hackathon requirements before any design or code decisions were made.

### Result

Produced a full Phase 1 analysis covering the mandatory requirements, the exact `POST /api/agent/init` / `GET /api/agent/feed` contract, data and persistence requirements, explicit autonomous-behavior constraints, failure-case handling, out-of-scope features, and a Definition of Done checklist.

The analysis established the key architectural requirement that the agent must continue producing work independently after initialization rather than relying on the evaluator repeatedly triggering generation.

No code was written in this session.

### Human Decision

Approved. Asked for a deployment recommendation and the full architecture before implementation.

---

## Session 2 — Deployment comparison and full architecture

### Prompt

Requested a comparison of deployment approaches including Render/Railway/Fly with an in-process scheduler, Vercel/serverless with an external scheduler, and any genuinely better option, followed by the complete architecture, data model, autonomous loop, persona proposal, editorial scoring design, memory strategy, live discovery design, LLM comparison, API contract confirmation, and demonstration UI plan.

### Purpose

Lock in the deployment model and complete system design before implementation, because the deployment decision determines whether autonomous execution after initialization is genuine or fragile.

### Result

Compared current deployment options and recommended a hybrid architecture:

* Render for the long-running Express application.
* GitHub Actions as the external scheduler.
* Hosted PostgreSQL for persistence.
* Gemini as the primary runtime LLM.
* Groq as the fallback LLM.
* Hacker News as the primary discovery source.
* RSS/Atom feeds as the discovery fallback.

The architecture deliberately avoids depending on an in-process timer for autonomy. The scheduler remains external to the application process, allowing the evaluator-facing API to remain read-only after initialization.

The design also introduced:

* A deterministic filtering stage.
* Editorial scoring across multiple dimensions.
* Memory-based duplicate detection.
* Grounded generation from discovered sources.
* Post validation.
* Cycle-run tracking.
* A read-only demonstration UI.

### Human Decision

Approved the architecture and requested a more concise decision-oriented finalization pass before coding.

---

## Session 3 — Concise final architecture decisions

### Prompt

Asked for a shortened, decision-only pass covering deployment choice, scheduler mechanics, persistence choice, runtime LLM choice, live discovery source, one combined architecture diagram, the top five risks with mitigations, and an 8–12 step implementation order.

### Purpose

Convert the full design into a crisp implementation decision set without repeating earlier requirement explanations.

### Result

Finalized:

* Render + GitHub Actions for autonomous scheduling.
* Hosted PostgreSQL for persistence.
* Gemini primary / Groq fallback for runtime LLM execution.
* Hacker News + RSS fallback for live discovery.
* A ten-stage autonomous cycle.
* Explicit failure handling and cycle recording.
* A read-only evaluator feed.
* A protected internal cycle endpoint.

### Human Decision

Approved with two important constraints:

1. Use an approximately hourly GitHub Actions schedule rather than an in-process timer under any circumstance.
2. Treat `POST /internal/run-cycle` strictly as a protected internal route, separate from the evaluator-facing API contract.

Also reconfirmed that `GET /api/agent/feed` must remain strictly read-only and must never trigger generation.

Requested three distinctive personas before implementation.

---

## Session 4 — Persona proposal and design finalization

### Prompt

Requested three distinctive, non-generic AI/technology personas, each with a name, domain, audience, mission, tone, editorial beliefs, followed/rejected topics, and example opinions, followed by a recommendation and the final simplified architecture, autonomous cycle, database tables, and implementation order.

### Purpose

Give the agent a genuine editorial point of view rather than creating another generic AI-news summarizer.

### Result

Proposed three personas:

* **Postmortem** — production AI failure analysis.
* **Open Weights** — open-source accountability.
* **Signal Loss** — applied systems reality-check.

Recommended **Postmortem** because it provided the clearest editorial test and the strongest alignment with the requirement to produce useful, technically grounded AI content.

The final design established:

* The Postmortem persona.
* A two-path architecture separating evaluator-facing API traffic from autonomous execution.
* A ten-stage autonomous cycle.
* Five PostgreSQL tables.
* Memory signatures for duplicate detection.
* Editorial acceptance/rejection.
* Grounded post generation.
* Protected internal scheduling.

### Human Decision

Approved the persona and architecture.

Two additional constraints were established:

1. Do not create an `/admin` API endpoint.
2. `GET /api/agent/feed` must never trigger generation.

Editorial rejections would instead be visible through the demonstration UI.

Implementation began with the approved step-by-step plan.

---

## Session 5 — Step 1 implementation: repository, environment, schema

### Prompt

Instructed implementation of Step 1 only: project structure, `.env.example`, `.gitignore`, the PostgreSQL schema/migration for `agents`, `posts`, `memory_signatures`, `rejected_topics`, and `cycle_runs`, a minimal database connection layer, and a basic `README.md`.

Explicitly excluded from this step were the agent loop, LLM integration, topic discovery, frontend, and other later-stage functionality.

### Purpose

Establish the persistence and configuration foundation without getting ahead of the approved implementation order.

### Result

Created:

* `package.json`
* `.env.example`
* `.gitignore`
* `src/storage/schema.sql`
* `src/storage/db.js`
* `scripts/migrate.js`
* `scripts/check-db.js`
* `README.md`
* `PROMPTS.md`

The database schema established the five approved tables, while the connection layer provided the shared PostgreSQL access used by later stages.

### Human Decision

Approved Step 1 and proceeded to Step 2.

---

## Session 6 — Step 2 implementation: `POST /api/agent/init`

### Prompt

Provided handoff instructions for a new session taking over the existing project, with the requirement to inspect the current Step 1 files first and confirm their state before implementing Step 2 only.

The requested implementation was `POST /api/agent/init`, including input validation, generation and persistence of an `agentId`, database insertion through the existing connection layer, and safe database-error handling.

Explicitly excluded from this step were `GET /api/agent/feed`, the autonomous loop, discovery, LLM integration, GitHub Actions, deployment, frontend work, and unrelated architecture changes.

### Purpose

Build the minimal evaluator-facing initialization endpoint on top of the approved Step 1 foundation.

### Result

Inspected the existing project and confirmed that it matched the expected Step 1 state.

Added:

* `express` dependency.
* `npm start` script.
* `src/app.js`.
* `src/server.js`.

Implemented `POST /api/agent/init` with:

* Request validation.
* Persona name/domain validation.
* Generated agent IDs.
* Persistence through the existing PostgreSQL query layer.
* Database failure handling.
* Appropriate HTTP responses.

The database schema was not changed.

### Human Decision

Approved Step 2 and then authorized implementation of the remaining system in one session.

---

## Session 7 — Full remaining system: discovery, editorial judgment, memory, generation, scheduler, frontend, tests, and documentation

### Prompt

Provided handoff instructions confirming the verified Step 1 + Step 2 state and instructed implementation of the remaining system in one batch without stopping for approval between sub-steps.

The requested system covered the complete:

`DISCOVER → NORMALIZE → FILTER → MEMORY CHECK → EDITORIAL JUDGMENT → SELECT → GENERATE → VALIDATE → STORE → COMPLETE`

pipeline, together with the read-only feed, protected internal cycle endpoint, GitHub Actions scheduler, demonstration frontend, tests, documentation, existing database, Gemini/Groq runtime choices, and Hacker News/RSS discovery choices.

### Purpose

Complete the core hackathon requirement: an autonomous agent that discovers topics, exercises genuine editorial judgment, rejects unsuitable topics, remembers previous work, generates grounded posts, persists its results, and continues operating independently of evaluator feed requests.

### Result

Implemented the complete application.

#### Discovery and normalization

Created `src/agent/discovery.js` with:

* Hacker News Firebase API discovery.
* AI/technology relevance filtering.
* Production-failure-oriented relevance signals.
* Concurrency-limited Hacker News item retrieval.
* RSS/Atom fallback feeds.
* Dependency-free feed parsing.
* HTTP timeout handling.
* Candidate normalization.
* Candidate ranking.

The discovery layer was deliberately kept separate from editorial judgment so discovery provides candidates while the editorial model decides what is actually worth publishing.

#### Deterministic filtering

Created `src/agent/filter.js` with:

* Persona-based avoid-list filtering.
* Freshness filtering.
* A maximum candidate age.
* Rejection records suitable for `rejected_topics`.

This keeps obvious low-quality candidates away from the LLM stage and reduces unnecessary LLM usage.

#### Memory

Created `src/agent/memory.js` with:

* Exact topic detection.
* Near-duplicate detection.
* Memory-signature persistence.
* Jaccard-based similarity.
* No vector database requirement.

A real tokenizer issue was discovered during testing: the initial similarity implementation unintentionally removed two-letter words, which silently removed `"AI"` from topic signatures. The issue was traced and corrected.

#### Editorial judgment

Created `src/agent/editorial.js` with structured LLM scoring across six editorial dimensions.

The acceptance rule combines numeric thresholds with the LLM's explicit acceptance decision rather than allowing a model-generated boolean by itself to determine publication.

This preserves the intended Postmortem editorial standard:

> A failure without a named mechanism is gossip, not a postmortem.

#### Generation

Created `src/agent/generator.js` to generate grounded Postmortem-style content from the selected discovered source and editorial rationale.

The generator is instructed to stay grounded in the discovered material rather than inventing an unrelated article.

#### Validation

Created `src/agent/validator.js` with checks for:

* Required fields.
* Valid timestamps.
* ISO 8601 UTC timestamps.
* Source grounding.
* Presence of the actually discovered URL in the generated source set.
* Near-duplicate generated post text.

#### Controller

Created `src/agent/controller.js` to orchestrate the complete autonomous cycle.

The controller records cycle outcomes and handles failures at each major stage instead of allowing an individual failure to crash the application.

Implemented failure paths include:

* Discovery/source failure.
* Deterministic rejection.
* Memory duplicate rejection.
* All-candidates-rejected outcome.
* LLM failure.
* Generation failure.
* Validation failure.
* Database failure.
* Overlapping `in_progress` cycle protection.

#### Utilities

Added:

* `src/utils/http.js` for timeout-protected HTTP requests.
* `src/utils/similarity.js` for topic keys and similarity calculations.
* `src/utils/llm.js` for Gemini primary / Groq fallback execution and structured JSON parsing.
* `src/persona/postmortem.js` as the single source of truth for the Postmortem editorial identity.

#### Database access

Added `src/storage/queries.js` to centralize SQL operations against the existing five-table schema.

The database schema itself was not redesigned.

#### Routes

Added `src/routes/agent.js`:

* `POST /api/agent/init`
* `GET /api/agent/feed`

The feed remains strictly read-only.

Initialization responds first and then starts the initial cycle on a best-effort, non-blocking basis.

Added `src/routes/internal.js`:

* Protected `POST /internal/run-cycle`.
* Read-only `GET /internal/demo-data`.

The internal cycle route requires the configured bearer secret and verifies that the target agent exists before execution.

The demo-data route was intentionally kept separate from the evaluator contract and does not provide an administrative mutation API.

#### Autonomous scheduling

Added `.github/workflows/agent-cycle.yml` with:

* Hourly scheduling.
* Manual `workflow_dispatch`.
* `APP_BASE_URL` secret.
* `RUN_CYCLE_SECRET` secret.
* `AGENT_ID` secret.
* HTTP invocation of the protected internal cycle route.

This ensures autonomous execution is not dependent on an evaluator calling the feed endpoint.

#### Demo frontend

Built the read-only demonstration UI:

* `public/index.html`
* `public/style.css`
* `public/app.js`

The UI shows:

* Agent identity.
* Persona mission.
* Published posts.
* Editorial rejections.
* Cycle outcomes.
* The live evaluator feed.

#### Testing

Added tests using Node's built-in `node:test` runner.

Coverage includes:

* Similarity logic.
* Deterministic filtering.
* RSS/Atom parsing.
* Editorial score validation.
* Post validation.
* Successful pipeline execution.
* Discovery failure.
* All-rejected cycles.
* Duplicate-memory rejection.
* LLM failure.
* Overlap protection.
* `POST /api/agent/init`.
* `GET /api/agent/feed`.
* Invalid and unknown agent IDs.
* Feed ordering and response shape.
* Protected cycle-route authentication.
* Successful cycle execution.

The full offline test suite reached a clean 48-test pass.

Because the development sandbox had no network access, real npm registry, Hacker News, Neon, Gemini, and Groq connectivity could not be exercised there. Temporary local stand-ins were used only to enable offline testing of database-dependent Express/controller paths and were removed before the final deliverable.

No live end-to-end result was fabricated.

### Human Decision

Approved the completed system and proceeded to real-environment debugging and final verification.

---

## Session 8 — Final debugging, verification, Git synchronization, and deployment readiness

### Prompt

After deployment-oriented testing, requested help diagnosing the remaining runtime and cycle issues without unnecessarily modifying unrelated files.

The debugging sequence included:

* Inspecting rejected topics and their editorial scores.
* Running the protected `/internal/run-cycle` endpoint manually.
* Inspecting cycle-run records.
* Inspecting `src/agent/discovery.js`, `src/agent/filter.js`, and `src/persona/postmortem.js`.
* Diagnosing a JavaScript syntax failure caused by accidental PowerShell here-string markers being written into `discovery.js`.
* Removing the stray `@'` prefix and trailing `'@ | Set-Content ...` text.
* Running `node --check` against the affected module and other important modules.
* Starting the Express server.
* Verifying `/health`.
* Verifying `GET /api/agent/feed`.
* Running an actual cycle.
* Inspecting cycle outcomes and rejection data.
* Checking Git status and diffs.
* Removing the temporary `discovery.js.backup`.
* Committing the final local changes.
* Resolving divergence between local `main` and `origin/main`.
* Merging the remote `main` change.
* Successfully pushing the resulting `main` branch to GitHub.

The final Git state was verified with:

`git status -sb`

showing the local `main` branch synchronized with `origin/main` and a clean working tree.

### Purpose

Perform the final real-environment debugging and repository synchronization necessary to move the project from "implemented" to "ready for hackathon evaluation" without introducing unnecessary changes to unrelated files.

### Result

A real syntax issue in `src/agent/discovery.js` was identified and fixed.

The issue was not an application-design problem. PowerShell here-string syntax had accidentally become part of the JavaScript source, causing Node.js to fail immediately with:

`SyntaxError: Invalid or unexpected token`

The file was cleaned without changing the surrounding architecture.

The module then passed:

`node --check .\src\agent\discovery.js`

Additional syntax checks were also run against the major agent, route, storage, and editorial modules.

The application successfully started with:

`npm start`

and reported:

`[server] Postmortem agent listening on port 3000`

The health endpoint returned:

`ok`

The evaluator-facing feed endpoint returned the persisted post data for the configured agent.

A real cycle was then executed through the protected internal route. The system correctly recorded editorial outcomes rather than crashing when candidates were unsuitable or already covered.

Earlier rejected-topic inspection demonstrated that the editorial system was actually exercising its rejection logic. Examples included:

* Product announcements being rejected for weak alignment with the Postmortem mission.
* Human biology/sleep research being rejected as unrelated to production AI failures.
* Previously covered topics being rejected as duplicates.

This confirmed that the agent was not simply publishing every discovered item.

During repository cleanup:

* The accidental backup file was removed.
* `.gitignore` changes were retained to prevent local environment files from being committed.
* The corrected discovery module was committed.
* The local branch was found to be one commit ahead while the remote branch had also advanced.
* A rebase attempt did not resolve the divergence cleanly.
* The remote branch was fetched and merged using Git's `ort` strategy.
* The resulting merge was successfully pushed to `origin/main`.

Final Git verification showed:

`## main...origin/main`

with a clean working tree.

The final application state therefore includes the implemented autonomous pipeline, protected scheduler endpoint, external GitHub Actions scheduling, persistence, editorial rejection and memory behavior, demonstration UI, tests, documentation, and synchronized source repository.

### Human Decision

Final project state approved.

The Postmortem Agent is considered **completed and ready for hackathon evaluation**.

The remaining deployment step is to redeploy the synchronized `main` branch to the configured hosting environment and verify the production `/health`, evaluator `init/feed`, and scheduled autonomous cycle against the real deployment.

---

## Final Project State

The project now satisfies the intended Autonomous AI Creator architecture:

```text
Evaluator
   │
   ├── POST /api/agent/init
   │        │
   │        └── Persist agent
   │                 │
   │                 └── Start initial cycle
   │
   └── GET /api/agent/feed
            │
            └── READ ONLY

GitHub Actions
   │
   │ hourly
   ▼
POST /internal/run-cycle
   │
   ▼
DISCOVER
   │
   ▼
NORMALIZE
   │
   ▼
FILTER
   │
   ▼
MEMORY CHECK
   │
   ▼
EDITORIAL JUDGMENT
   │
   ├── reject → rejected_topics
   │
   └── select
          │
          ▼
       GENERATE
          │
          ▼
       VALIDATE
          │
          ├── reject → cycle outcome
          │
          ▼
        STORE
          │
          ▼
       COMPLETE
```

The editorial identity is intentionally narrow:

**Postmortem — Production AI Failure Analysis**

Its purpose is not to summarize AI news. It is to identify technically meaningful failures, mechanisms, regressions, incidents, and production lessons that engineers can learn from.

The system therefore demonstrates the core autonomous behavior required by the project:

* It discovers live material.
* It filters obvious noise.
* It remembers previously covered topics.
* It rejects candidates that do not meet its editorial standard.
* It selects candidates using structured editorial judgment.
* It generates grounded posts.
* It validates generated content.
* It persists results and memory.
* It records cycle outcomes.
* It runs independently through an external scheduler.
* Its evaluator-facing feed remains read-only.

### Final verification status

| Area                               | Status                                 |
| ---------------------------------- | -------------------------------------- |
| Repository                         | Complete                               |
| Persona                            | Complete                               |
| PostgreSQL persistence             | Complete                               |
| Agent initialization               | Complete                               |
| Live discovery                     | Complete                               |
| Deterministic filtering            | Complete                               |
| Memory / duplicate detection       | Complete                               |
| LLM editorial judgment             | Complete                               |
| Generation                         | Complete                               |
| Validation                         | Complete                               |
| Cycle orchestration                | Complete                               |
| Protected internal scheduler route | Complete                               |
| GitHub Actions scheduler           | Complete                               |
| Read-only evaluator feed           | Complete                               |
| Demo UI                            | Complete                               |
| Automated tests                    | 48 tests passed in offline environment |
| Runtime syntax validation          | Passed                                 |
| Local server startup               | Passed                                 |
| Health endpoint                    | Passed                                 |
| Real cycle execution               | Verified                               |
| Git repository synchronization     | Complete                               |
| Working tree                       | Clean                                  |
| Final status                       | **Ready for hackathon evaluation**     |
