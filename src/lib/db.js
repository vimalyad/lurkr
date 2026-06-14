// Neon (Postgres) persistence + the per-user data model.
//
// Tables:
//   users         — accounts (password and/or google), email verification state
//   email_tokens  — one-time tokens for email verification + password reset
//   ideas         — each startup/idea a user submits; daily_refresh opt-in flag
//   analyses      — analysis snapshots per idea (the cache; newest row = latest)
//   usage_events  — lightweight usage log for future usage-based billing
//
// Auth requires the DB, so unlike before, the app expects DATABASE_URL to be set.
// Every function still no-ops/returns empty when the pool is unavailable so the
// process never crashes on a missing DB — callers surface a clear error instead.
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
      max: 5,
    });
  }
  return pool;
}

export async function initDb() {
  const p = getPool();
  if (!p) return false;
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT,
      password_hash TEXT,
      auth_provider TEXT NOT NULL DEFAULT 'password',
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id            BIGSERIAL PRIMARY KEY,
      user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idea          TEXT NOT NULL,
      features      TEXT NOT NULL DEFAULT '',
      space         TEXT NOT NULL DEFAULT '',
      daily_refresh BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ideas_user_idx ON ideas(user_id);
    CREATE INDEX IF NOT EXISTS ideas_daily_idx ON ideas(daily_refresh) WHERE daily_refresh = TRUE;

    CREATE TABLE IF NOT EXISTS analyses (
      id          BIGSERIAL PRIMARY KEY,
      idea_id     BIGINT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
      competitors JSONB,
      agents      JSONB,   -- { marketing:[...], product:[...], sales:[...] }
      brief       JSONB,   -- strategy brief
      counts      JSONB,   -- signal counts
      source      TEXT NOT NULL DEFAULT 'live',  -- 'live' | 'cron'
      run_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS analyses_idea_idx ON analyses(idea_id, run_at DESC);

    CREATE TABLE IF NOT EXISTS usage_events (
      id         BIGSERIAL PRIMARY KEY,
      user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
      type       TEXT NOT NULL,
      idea_id    BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS usage_user_idx ON usage_events(user_id, created_at DESC);
  `);
  return true;
}

// ── Users ──────────────────────────────────────────────────────────────────────
export async function createUser({ email, name, passwordHash = null, provider = "password", emailVerified = false }) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO users (email, name, password_hash, auth_provider, email_verified)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, auth_provider, email_verified, created_at`,
    [email.toLowerCase(), name || null, passwordHash, provider, emailVerified]
  );
  return r.rows[0];
}

export async function getUserByEmail(email) {
  const p = getPool();
  const r = await p.query(`SELECT * FROM users WHERE email = $1`, [String(email).toLowerCase()]);
  return r.rows[0] || null;
}

export async function getUserById(id) {
  const p = getPool();
  const r = await p.query(
    `SELECT id, email, name, auth_provider, email_verified, created_at FROM users WHERE id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

// A Google sign-in for an existing (password) account links the provider + name.
export async function linkGoogle(userId, name) {
  const p = getPool();
  await p.query(
    `UPDATE users
       SET email_verified = TRUE,
           name = COALESCE(name, $2),
           auth_provider = CASE WHEN auth_provider = 'password' THEN 'password+google' ELSE auth_provider END
     WHERE id = $1`,
    [userId, name || null]
  );
}

// ── Ideas ────────────────────────────────────────────────────────────────────────
export async function createIdea({ userId, idea, features = "", space = "" }) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO ideas (user_id, idea, features, space)
     VALUES ($1, $2, $3, $4)
     RETURNING id, idea, features, space, daily_refresh, created_at, updated_at`,
    [userId, idea, features, space]
  );
  return r.rows[0];
}

// Reuse an existing idea with the same text for this user, else create one. Keeps
// "My Ideas" to one card per distinct idea while every sweep appends an analysis row.
export async function findOrCreateIdea({ userId, idea, features = "", space = "" }) {
  const p = getPool();
  const existing = await p.query(
    `SELECT * FROM ideas WHERE user_id = $1 AND idea = $2 AND features = $3 LIMIT 1`,
    [userId, idea, features]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (space && space !== row.space) {
      await p.query(`UPDATE ideas SET space = $2, updated_at = now() WHERE id = $1`, [row.id, space]);
      row.space = space;
    }
    return row;
  }
  return createIdea({ userId, idea, features, space });
}

export async function getIdea(id, userId) {
  const p = getPool();
  const r = await p.query(`SELECT * FROM ideas WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rows[0] || null;
}

export async function listIdeas(userId) {
  const p = getPool();
  const r = await p.query(
    `SELECT i.*, a.run_at AS last_run, a.source AS last_source
       FROM ideas i
       LEFT JOIN LATERAL (
         SELECT run_at, source FROM analyses WHERE idea_id = i.id ORDER BY run_at DESC LIMIT 1
       ) a ON TRUE
      WHERE i.user_id = $1
      ORDER BY i.updated_at DESC`,
    [userId]
  );
  return r.rows;
}

export async function setIdeaSpace(id, space) {
  const p = getPool();
  await p.query(`UPDATE ideas SET space = $2, updated_at = now() WHERE id = $1`, [id, space]);
}

export async function setDailyRefresh(id, userId, on) {
  const p = getPool();
  const r = await p.query(
    `UPDATE ideas SET daily_refresh = $3, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id, daily_refresh`,
    [id, userId, Boolean(on)]
  );
  return r.rows[0] || null;
}

// Every idea opted into daily refresh (across all users), with the owner attached.
export async function ideasDueForRefresh() {
  const p = getPool();
  const r = await p.query(
    `SELECT i.id, i.user_id, i.idea, i.features, i.space
       FROM ideas i WHERE i.daily_refresh = TRUE
       ORDER BY i.id`
  );
  return r.rows;
}

// ── Analyses (the cache) ──────────────────────────────────────────────────────────
export async function saveAnalysis({ ideaId, competitors, agents, brief, counts, source = "live" }) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO analyses (idea_id, competitors, agents, brief, counts, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, run_at, source`,
    [
      ideaId,
      JSON.stringify(competitors || []),
      JSON.stringify(agents || {}),
      JSON.stringify(brief || {}),
      JSON.stringify(counts || {}),
      source,
    ]
  );
  await p.query(`UPDATE ideas SET updated_at = now() WHERE id = $1`, [ideaId]);
  return r.rows[0];
}

export async function latestAnalysis(ideaId) {
  const p = getPool();
  const r = await p.query(
    `SELECT competitors, agents, brief, counts, source, run_at
       FROM analyses WHERE idea_id = $1 ORDER BY run_at DESC LIMIT 1`,
    [ideaId]
  );
  return r.rows[0] || null;
}

// ── Usage (future billing) ─────────────────────────────────────────────────────────
export async function logUsage({ userId = null, type, ideaId = null }) {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(`INSERT INTO usage_events (user_id, type, idea_id) VALUES ($1, $2, $3)`, [userId, type, ideaId]);
  } catch {
    /* usage logging must never break a request */
  }
}
