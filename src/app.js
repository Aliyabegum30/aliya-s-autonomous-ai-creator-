// Express application setup.
// Kept separate from server.js (which just starts listening) so the app
// itself can be imported directly by tests without binding a port.

const path = require('path');
const express = require('express');

const agentRoutes = require('./routes/agent');
const internalRoutes = require('./routes/internal');

const app = express();
app.use(express.json());

// Mandatory evaluator-facing contract: exactly POST /api/agent/init and
// GET /api/agent/feed. See routes/agent.js.
app.use('/api', agentRoutes);

// Internal-only routes (scheduler trigger + demo data). Not part of the
// evaluator contract. See routes/internal.js.
app.use('/internal', internalRoutes);

// Read-only demo frontend. Static files only — it calls /internal/demo-data
// and /api/agent/feed from the browser; it does not add any server logic.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
