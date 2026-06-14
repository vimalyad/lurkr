// Optional Neon (Postgres) persistence. Everything is gated on DATABASE_URL — if it's not
// set (or the DB is unreachable), the app still works fully; we just skip persistence.
import pg from "pg";

let pool = null;

export function dbEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export async function initDb() {
  const p = getPool();
  if (!p) return false;
  await p.query(`
    CREATE TABLE IF NOT EXISTS sweeps (
      id SERIAL PRIMARY KEY,
      idea TEXT NOT NULL,
      features TEXT,
      space TEXT,
      competitors JSONB,
      brief JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  return true;
}

export async function saveSweep({ idea, features, space, competitors, brief }) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO sweeps (idea, features, space, competitors, brief)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [idea, features || "", space || "", JSON.stringify(competitors || []), JSON.stringify(brief || {})]
  );
  return r.rows[0];
}

export async function recentSweeps(limit = 20) {
  const p = getPool();
  if (!p) return [];
  const r = await p.query(
    `SELECT id, idea, features, space, brief, created_at
     FROM sweeps ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}
