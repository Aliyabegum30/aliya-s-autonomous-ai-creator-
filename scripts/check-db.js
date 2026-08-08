// Quick connectivity check: confirms DATABASE_URL works and lists which
// tables currently exist. Useful right after `npm run migrate`, and useful
// again in later steps to sanity-check the deployed database.

const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in first.');
    process.exit(1);
  }

  const useSsl = !process.env.DATABASE_URL.includes('localhost');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const { rows } = await pool.query('SELECT NOW() as now');
    console.log('Connected. DB time:', rows[0].now);

    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = tables.rows.map((r) => r.table_name);
    console.log('Tables found:', names.length ? names.join(', ') : '(none yet — run: npm run migrate)');
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
