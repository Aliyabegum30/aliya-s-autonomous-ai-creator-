// Manual test helper: runs exactly one autonomous cycle for a given agent,
// directly against DATABASE_URL — no HTTP server needed. Useful for local
// end-to-end testing before wiring up GitHub Actions.
//
// Usage:
//   node scripts/run-cycle-manual.js <agentId>
//
// Requires .env to have DATABASE_URL and GEMINI_API_KEY set (GROQ_API_KEY
// optional, only used as a fallback).

require('dotenv').config();
const { runCycle } = require('../src/agent/controller');
const { pool } = require('../src/storage/db');

async function main() {
  const agentId = process.argv[2];
  if (!agentId) {
    console.error('Usage: node scripts/run-cycle-manual.js <agentId>');
    process.exitCode = 1;
    return;
  }

  console.log(`Running one autonomous cycle for agent ${agentId} ...`);
  const result = await runCycle(agentId);
  console.log('Cycle result:', JSON.stringify(result, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error('Manual cycle run failed:', err);
  process.exitCode = 1;
});
