// Applies src/storage/schema.sql to the database at DATABASE_URL.
// Deliberately not a migration framework — one file, one command, easy to
// read and re-run. Every statement in schema.sql uses IF NOT EXISTS, so
// running this multiple times is safe.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in first.');
    process.exit(1);
  }

  const useSsl = !process.env.DATABASE_URL.includes('localhost');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  const schemaPath = path.join(__dirname, '..', 'src', 'storage', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Applying schema.sql ...');
  try {
    await pool.query(sql);
    console.log('Schema applied successfully. Tables: agents, posts, memory_signatures, rejected_topics, cycle_runs');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
