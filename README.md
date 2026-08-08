# Postmortem Agent

An autonomous AI/technology persona built for the ABTalks Vibe Code Hackathon.
"Postmortem" independently discovers AI/tech topics, applies editorial
judgment, and publishes commentary in a consistent voice — without further
human instructions after initialization.

**Status: Step 1 complete.** Only the project structure, environment
configuration, and PostgreSQL schema/connection layer exist so far. There is
no HTTP server, agent loop, LLM integration, or frontend yet — those are
implemented in later steps.

## Prerequisites

- Node.js 18 or later
- A PostgreSQL database (a free hosted instance on [Neon](https://neon.tech)
  or [Supabase](https://supabase.com) is recommended; a local Postgres also
  works)

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set DATABASE_URL to your Postgres connection string
npm run migrate
npm run db:check
```

`npm run migrate` applies `src/storage/schema.sql`, creating five tables:
`agents`, `posts`, `memory_signatures`, `rejected_topics`, `cycle_runs`.

`npm run db:check` confirms the connection works and lists the tables that
currently exist — useful for verifying setup before moving on.

## Project structure (current)

```
/src
  /storage
    schema.sql   -- table definitions, applied by npm run migrate
    db.js        -- shared PostgreSQL connection pool
/scripts
  migrate.js     -- applies schema.sql to DATABASE_URL
  check-db.js    -- connectivity + table listing check
.env.example
.gitignore
PROMPTS.md
README.md
```

## What comes next

The HTTP API (`POST /api/agent/init`, `GET /api/agent/feed`), the autonomous
agent pipeline, the protected internal scheduler route, the GitHub Actions
workflow, and the demo frontend are implemented in subsequent steps and are
not part of this commit.
