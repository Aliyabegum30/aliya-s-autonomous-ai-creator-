// Express application setup.
// Kept separate from server.js (which just starts listening) so the app
// itself can be imported directly in tests later without binding a port.

const express = require('express');
const { query } = require('./storage/db');

const app = express();
app.use(express.json());

/**
 * POST /api/agent/init
 *
 * Request:  { "persona": { "name": "string", "domain": "string" } }
 * Response: { "agentId": "string" }
 *
 * Creates one row in `agents` and returns its id. This is the ONLY thing
 * this route does at this step — no generation, no pipeline, no loop.
 */
app.post('/api/agent/init', async (req, res) => {
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

  try {
    const result = await query(
      `INSERT INTO agents (persona) VALUES ($1) RETURNING agent_id`,
      [JSON.stringify({ name, domain })]
    );

    const agentId = result.rows[0].agent_id;
    return res.status(201).json({ agentId });
  } catch (err) {
    console.error('[POST /api/agent/init] Database error:', err.message);
    return res.status(500).json({ error: 'Failed to create agent. Please try again.' });
  }
});

module.exports = app;
