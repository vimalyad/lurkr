// Lurkr backend — Express server. Holds the API keys, the agents, auth, and the
// per-user data model, so none of it ships inside the APK. The frontend (browser
// or Capacitor APK) calls these endpoints. Reuses src/lib/* directly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import cors from "cors";
import { runAgent } from "../src/lib/openrouter.js";
import { DISCOVERY, ANALYSTS, STRATEGY } from "../src/lib/agents.js";
import { gatherSignals } from "../src/lib/gather.js";
import { runFullSweep } from "../src/lib/pipeline.js";
import {
  hashPassword, verifyPassword, signJwt, verifyJwt,
  verifyGoogleIdToken, randomToken, isValidEmail, passwordProblem,
} from "../src/lib/auth.js";
import { sendVerificationEmail, sendResetEmail } from "../src/lib/email.js";
import * as db from "../src/lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Load keys from .env.local (preferred) then .env — Express doesn't auto-load these.
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(join(ROOT, f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const app = express();
app.use(cors()); // open CORS — the APK / hosted frontend call from another origin
app.use(express.json({ limit: "1mb" }));

const fail = (res, code, error) => res.status(code).json({ ok: false, error });

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "lurkr-backend", db: db.dbEnabled() })
);

// ── Auth middleware ────────────────────────────────────────────────────────────
// Validates the Bearer JWT and loads the (fresh) user so email-verification state
// is always current. requireVerified additionally blocks unverified accounts.
async function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const payload = verifyJwt(token);
    if (!payload?.uid) return fail(res, 401, "Sign in to continue.");
    const user = await db.getUserById(payload.uid);
    if (!user) return fail(res, 401, "Account not found.");
    req.user = user;
    next();
  } catch (err) {
    return fail(res, 401, "Session expired — sign in again.");
  }
}

function requireVerified(req, res, next) {
  if (!req.user?.email_verified) return fail(res, 403, "Please verify your email first.");
  next();
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, emailVerified: u.email_verified, authProvider: u.auth_provider });
const issueToken = (u) => signJwt({ uid: u.id, email: u.email });

// ── Auth routes ──────────────────────────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  if (!db.dbEnabled()) return fail(res, 500, "Database not configured.");
  const { email, password, name } = req.body || {};
  if (!isValidEmail(email)) return fail(res, 400, "Enter a valid email.");
  const pwProblem = passwordProblem(password);
  if (pwProblem) return fail(res, 400, pwProblem);
  try {
    if (await db.getUserByEmail(email)) return fail(res, 409, "An account with that email already exists.");
    const user = await db.createUser({
      email, name, passwordHash: await hashPassword(password), provider: "password", emailVerified: false,
    });
    const token = randomToken();
    await db.createEmailToken({ userId: user.id, kind: "verify", token, ttlMinutes: 60 * 24 });
    sendVerificationEmail(user.email, token).catch((e) => console.warn("verify email failed:", e.message));
    db.logUsage({ userId: user.id, type: "signup" });
    res.json({ ok: true, token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!db.dbEnabled()) return fail(res, 500, "Database not configured.");
  const { email, password } = req.body || {};
  try {
    const user = await db.getUserByEmail(email || "");
    if (!user || !(await verifyPassword(password || "", user.password_hash))) {
      return fail(res, 401, "Incorrect email or password.");
    }
    res.json({ ok: true, token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

app.post("/api/auth/google", async (req, res) => {
  if (!db.dbEnabled()) return fail(res, 500, "Database not configured.");
  const { credential } = req.body || {};
  try {
    const { email, name } = await verifyGoogleIdToken(credential);
    let user = await db.getUserByEmail(email);
    if (!user) {
      user = await db.createUser({ email, name, provider: "google", emailVerified: true });
      db.logUsage({ userId: user.id, type: "signup" });
    } else {
      await db.linkGoogle(user.id, name);
      user = await db.getUserById(user.id);
    }
    res.json({ ok: true, token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    fail(res, 401, String(err?.message || err));
  }
});

app.post("/api/auth/verify-email", async (req, res) => {
  const { token } = req.body || {};
  try {
    const userId = await db.consumeEmailToken(token, "verify");
    if (!userId) return fail(res, 400, "This verification link is invalid or has expired.");
    await db.setEmailVerified(userId);
    const user = await db.getUserById(userId);
    res.json({ ok: true, token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
  try {
    if (req.user.email_verified) return res.json({ ok: true, alreadyVerified: true });
    const token = randomToken();
    await db.createEmailToken({ userId: req.user.id, kind: "verify", token, ttlMinutes: 60 * 24 });
    await sendVerificationEmail(req.user.email, token);
    res.json({ ok: true });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

// Always reply ok (don't leak which emails exist).
app.post("/api/auth/request-reset", async (req, res) => {
  const { email } = req.body || {};
  try {
    const user = await db.getUserByEmail(email || "");
    if (user) {
      const token = randomToken();
      await db.createEmailToken({ userId: user.id, kind: "reset", token, ttlMinutes: 60 });
      sendResetEmail(user.email, token).catch((e) => console.warn("reset email failed:", e.message));
    }
    res.json({ ok: true });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password } = req.body || {};
  const pwProblem = passwordProblem(password);
  if (pwProblem) return fail(res, 400, pwProblem);
  try {
    const userId = await db.consumeEmailToken(token, "reset");
    if (!userId) return fail(res, 400, "This reset link is invalid or has expired.");
    await db.setPasswordHash(userId, await hashPassword(password));
    const user = await db.getUserById(userId);
    res.json({ ok: true, token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

app.get("/api/me", requireAuth, (req, res) => res.json({ ok: true, user: publicUser(req.user) }));

// ── Intelligence pipeline (interactive; authed + verified) ───────────────────────
app.post("/api/discover", requireAuth, requireVerified, async (req, res) => {
  const { idea, features } = req.body || {};
  if (!idea || !idea.trim()) return fail(res, 400, "Describe your idea first.");
  try {
    const result = await runAgent({
      model: DISCOVERY.model,
      system: DISCOVERY.system,
      user: JSON.stringify({ your_idea: idea, your_features: features || "" }),
    });
    db.logUsage({ userId: req.user.id, type: "discover" });
    res.json({
      ok: true,
      space: result.space || "",
      competitors: Array.isArray(result.competitors) ? result.competitors : [],
    });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

app.post("/api/gather", requireAuth, requireVerified, async (req, res) => {
  const competitors = Array.isArray(req.body?.competitors) ? req.body.competitors : [];
  if (competitors.length === 0) return fail(res, 400, "No competitors to gather for.");
  if (!process.env.TAVILY_API_KEY) return fail(res, 500, "TAVILY_API_KEY not configured.");
  try {
    const buckets = await gatherSignals(competitors);
    db.logUsage({ userId: req.user.id, type: "gather" });
    res.json({ ok: true, ...buckets });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

app.post("/api/agent/:id", requireAuth, requireVerified, async (req, res) => {
  const agent = ANALYSTS.find((a) => a.id === req.params.id);
  if (!agent) return fail(res, 404, `Unknown agent: ${req.params.id}`);
  const { idea, features, competitors, signals } = req.body || {};
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return fail(res, 400, "No competitors to analyze.");
  }
  try {
    const result = await runAgent({
      model: agent.model,
      system: agent.system,
      user: JSON.stringify({
        your_idea: idea || "", your_features: features || "",
        competitors, signals: Array.isArray(signals) ? signals : [],
      }),
    });
    res.json({ agent: agent.id, ok: true, findings: result.findings ?? [] });
  } catch (err) {
    res.status(500).json({ agent: agent.id, ok: false, error: String(err?.message || err) });
  }
});

// Strategy synthesis. Also persists the sweep under the user's idea (the cache).
app.post("/api/strategy", requireAuth, requireVerified, async (req, res) => {
  const { idea, features, space, competitors, marketing, product, sales } = req.body || {};
  try {
    const result = await runAgent({
      model: STRATEGY.model,
      system: STRATEGY.system,
      user: JSON.stringify({ your_idea: idea, your_features: features, space, competitors, marketing, product, sales }),
    });
    let ideaId = null;
    try {
      const ideaRow = await db.findOrCreateIdea({ userId: req.user.id, idea: idea || "", features: features || "", space: space || "" });
      ideaId = ideaRow.id;
      await db.saveAnalysis({
        ideaId,
        competitors,
        agents: { marketing: marketing || [], product: product || [], sales: sales || [] },
        brief: result,
        counts: req.body?.counts || {},
        source: "live",
      });
      db.logUsage({ userId: req.user.id, type: "search", ideaId });
    } catch (e) {
      console.warn("persist sweep failed:", e.message);
    }
    res.json({ agent: "strategy", ok: true, ideaId, ...result });
  } catch (err) {
    res.status(500).json({ agent: "strategy", ok: false, error: String(err?.message || err) });
  }
});

// ── Ideas (the user's saved startups + cached analyses) ──────────────────────────
app.get("/api/ideas", requireAuth, async (req, res) => {
  try {
    res.json({ ok: true, ideas: await db.listIdeas(req.user.id) });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

// Serve the latest stored analysis (stale-while-present). On a cache miss the
// frontend falls back to running a fresh interactive sweep — same as before.
app.get("/api/ideas/:id", requireAuth, async (req, res) => {
  try {
    const idea = await db.getIdea(req.params.id, req.user.id);
    if (!idea) return fail(res, 404, "Idea not found.");
    const analysis = await db.latestAnalysis(idea.id);
    res.json({ ok: true, idea, analysis });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

app.post("/api/ideas/:id/daily-refresh", requireAuth, async (req, res) => {
  try {
    const updated = await db.setDailyRefresh(req.params.id, req.user.id, !!req.body?.enabled);
    if (!updated) return fail(res, 404, "Idea not found.");
    res.json({ ok: true, dailyRefresh: updated.daily_refresh });
  } catch (err) {
    fail(res, 500, String(err?.message || err));
  }
});

// ── Daily refresh cron (triggered by the GitHub Actions schedule) ────────────────
// Protected by a shared secret in the X-Cron-Secret header. Re-runs the full sweep
// for every idea opted into daily refresh and stores the result as a 'cron' analysis.
app.post("/api/cron/daily-refresh", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get("x-cron-secret") !== secret) return fail(res, 401, "Unauthorized.");
  try {
    const due = await db.ideasDueForRefresh();
    res.json({ ok: true, scheduled: due.length }); // respond immediately; refresh in background
    for (const idea of due) {
      try {
        const sweep = await runFullSweep({ idea: idea.idea, features: idea.features });
        if (sweep.competitors.length === 0) continue;
        if (sweep.space) await db.setIdeaSpace(idea.id, sweep.space);
        await db.saveAnalysis({
          ideaId: idea.id,
          competitors: sweep.competitors,
          agents: sweep.agents,
          brief: sweep.brief,
          counts: sweep.counts,
          source: "cron",
        });
        db.logUsage({ userId: idea.user_id, type: "cron_refresh", ideaId: idea.id });
        console.log(`daily-refresh: idea ${idea.id} updated`);
      } catch (e) {
        console.warn(`daily-refresh: idea ${idea.id} failed —`, e.message);
      }
    }
  } catch (err) {
    if (!res.headersSent) fail(res, 500, String(err?.message || err));
  }
});

const PORT = process.env.PORT || process.env.BACKEND_PORT || 8787;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Lurkr backend listening on http://0.0.0.0:${PORT}`);
  if (db.dbEnabled()) {
    try {
      await db.initDb();
      console.log("Neon persistence: ready");
    } catch (e) {
      console.warn("Neon persistence: init failed —", e.message);
    }
  } else {
    console.warn("Neon persistence: DISABLED (no DATABASE_URL) — auth will not work");
  }
});
