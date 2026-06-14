// Lurkr backend — standalone Express server. Holds the API keys and runs the agents,
// so the keys never ship inside the APK. The Vite frontend (browser or Capacitor APK)
// calls these endpoints. Reuses src/lib/* directly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import cors from "cors";
import { runAgent } from "../src/lib/openrouter.js";
import { DISCOVERY, ANALYSTS, STRATEGY } from "../src/lib/agents.js";
import { gatherSignals } from "../src/lib/gather.js";

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
app.use(cors()); // open CORS — local laptop backend for the APK/browser
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "lurkr-backend" }));

app.post("/api/discover", async (req, res) => {
  const { idea, features } = req.body || {};
  if (!idea || !idea.trim()) return res.status(400).json({ ok: false, error: "Describe your idea first." });
  try {
    const result = await runAgent({
      model: DISCOVERY.model,
      system: DISCOVERY.system,
      user: JSON.stringify({ your_idea: idea, your_features: features || "" }),
    });
    res.json({
      ok: true,
      space: result.space || "",
      competitors: Array.isArray(result.competitors) ? result.competitors : [],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/api/gather", async (req, res) => {
  const competitors = Array.isArray(req.body?.competitors) ? req.body.competitors : [];
  if (competitors.length === 0) return res.status(400).json({ ok: false, error: "No competitors to gather for." });
  if (!process.env.TAVILY_API_KEY) return res.status(500).json({ ok: false, error: "TAVILY_API_KEY not configured." });
  try {
    const buckets = await gatherSignals(competitors);
    res.json({ ok: true, ...buckets });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/api/agent/:id", async (req, res) => {
  const agent = ANALYSTS.find((a) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: `Unknown agent: ${req.params.id}` });
  const { idea, features, competitors, signals } = req.body || {};
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return res.status(400).json({ ok: false, error: "No competitors to analyze." });
  }
  try {
    const result = await runAgent({
      model: agent.model,
      system: agent.system,
      user: JSON.stringify({
        your_idea: idea || "",
        your_features: features || "",
        competitors,
        signals: Array.isArray(signals) ? signals : [],
      }),
    });
    res.json({ agent: agent.id, ok: true, findings: result.findings ?? [] });
  } catch (err) {
    res.status(500).json({ agent: agent.id, ok: false, error: String(err?.message || err) });
  }
});

app.post("/api/strategy", async (req, res) => {
  try {
    const result = await runAgent({
      model: STRATEGY.model,
      system: STRATEGY.system,
      user: JSON.stringify(req.body || {}),
    });
    res.json({ agent: "strategy", ok: true, ...result });
  } catch (err) {
    res.status(500).json({ agent: "strategy", ok: false, error: String(err?.message || err) });
  }
});

const PORT = process.env.BACKEND_PORT || 8787;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Lurkr backend listening on http://0.0.0.0:${PORT}`);
});
