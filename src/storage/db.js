// Minimal database connection layer.
// Every other module (API routes, agent pipeline) should import { query } or
// { pool } from here rather than creating its own Postgres connection.

const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  // Not fatal at import time — some scripts (e.g. tests that don't touch the
  // DB) may not need it — but every real query will fail until it's set.
  console.warn('[db] DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

// Hosted providers (Neon, Supabase) require SSL. A local Postgres instance
// usually does not. This is a simple heuristic, not a security control.
const useSsl = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  // Prevents an idle client error from crashing the whole process.
  console.error('[db] Unexpected error on idle client:', err.message);
});

/**
 * Run a parameterized query against the pool.
 * @param {string} text - SQL with $1, $2, ... placeholders
 * @param {Array} params
 */
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
