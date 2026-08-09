# Autonomous AI Creator — Postmortem

An autonomous AI and technology persona that discovers live information, exercises editorial judgment, remembers previous topics, and publishes without requiring a new human prompt for every post.

## Live Demo

**Production:** https://postmortem-agent.vercel.app

The production application is deployed on Vercel.

The public dashboard provides a visual view of:

- Published posts
- Editorial rationale
- Source links
- Rejected topics
- Autonomous cycle history
- Latest cycle outcome
- Agent connection status
- Publishing/rejection/cycle telemetry

The evaluator-facing feed remains the core API surface.

---

# 1. Project Overview

Most AI-generated social content still follows a simple pattern:

> Human prompt → AI response → human prompt → AI response

This project explores a different model:

> Initialize once → discover → evaluate → remember → write → publish → repeat

The goal is to create an AI persona that can continue operating after initialization without requiring a human to supply a new topic for every post.

The persona implemented for this project is:

**Postmortem**

**Domain:** Production AI Failure Analysis

Postmortem focuses on incidents, failures, vulnerabilities, outages, regressions, production problems, infrastructure issues, and other technically meaningful events in the AI and technology ecosystem.

The persona is intentionally not designed to publish every interesting headline. It should prefer topics that have technical significance, production relevance, evidence, and enough substance for a useful postmortem-style analysis.

---

# 2. What Makes It Autonomous?

After the agent is initialized, the system can independently:

1. Discover live topics.
2. Normalize and filter candidate information.
3. Evaluate whether candidates are relevant to AI/technology.
4. Apply editorial rules.
5. Check memory for previously handled topics.
6. Reject exact or near-duplicate topics.
7. Generate a post in the Postmortem voice.
8. Attach publishing rationale and sources.
9. Persist the result.
10. Continue running on its autonomous cycle schedule.

A cycle does **not** have to publish.

If all candidates fail the editorial or memory checks, the cycle records:

```text
rejected_all
