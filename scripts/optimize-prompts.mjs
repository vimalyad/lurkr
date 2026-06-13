// Automatic Prompt Optimization (OPRO-style) for Lurkr's analyst agents.
//
// Offline tool — NOT in the request path. For a chosen agent it:
//   1. evaluates the current ("seed") system prompt on fixed test cases,
//   2. scores each output with an LLM-as-judge on a rubric,
//   3. asks an optimizer LLM to propose a better prompt from the scored history,
//   4. loops, keeps the best-scoring prompt.
// The winner is written to scripts/optimized-prompts.json for human review before
// being copied into src/lib/agents.js. Nothing here mutates the running app.
//
// Usage:  node scripts/optimize-prompts.mjs [marketing|product|sales] [rounds]
//   e.g.  node scripts/optimize-prompts.mjs marketing 3

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(ROOT, f), "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
}
loadEnv();

const ANALYST_MODEL = "anthropic/claude-3.5-haiku";
const OPTIMIZER_MODEL = "anthropic/claude-sonnet-4.5";

// ── OpenRouter ──────────────────────────────────────────────────────────────────
function parseLoose(text) {
  let s = String(text).trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a !== -1 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("unparseable JSON");
  }
}

async function callLLM({ model, system, user, temperature = 0.7 }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseLoose((await res.json()).choices[0].message.content);
}

// ── Agent specs (seed prompts mirror src/lib/agents.js — copy the winner back) ──
const GROUNDING = ` You may also receive "signals": live web and news results about these competitors. When signals are present, base your findings PRIMARILY on these concrete signals and reference what they actually say (cite the title/source); if signals are sparse for a competitor, say so and lower confidence rather than inventing detail.`;

const AGENTS = {
  marketing: {
    schema: `{findings: [{competitor, signal, insight, trend_direction:'rising'|'flat'|'declining', confidence:0-1}]}`,
    seed: `You are a marketing intelligence analyst. The user's own product is described in the input as "your_idea"/"your_features". For each competitor listed, identify their marketing positioning, campaign themes, and market trends — focusing on what matters for the user's product. Return ONLY JSON: {findings: [{competitor, signal, insight, trend_direction:'rising'|'flat'|'declining', confidence:0-1}]}. Tie each insight to something concrete.${GROUNDING}`,
  },
  product: {
    schema: `{findings: [{competitor, theme, sentiment:'pos'|'neg'|'mixed', feature_gap, opportunity}]}`,
    seed: `You are a product intelligence analyst. The user's own product is described in the input as "your_idea"/"your_features". For each competitor listed, extract customer sentiment, recurring complaints, and feature gaps — especially gaps the user's product could exploit. Return ONLY JSON: {findings: [{competitor, theme, sentiment:'pos'|'neg'|'mixed', feature_gap, opportunity}]}.${GROUNDING}`,
  },
  sales: {
    schema: `{findings: [{competitor, signal_type:'funding'|'hiring'|'expansion', detail, buying_signal, urgency:'high'|'med'|'low'}]}`,
    seed: `You are a sales intelligence analyst. The user's own product is described in the input as "your_idea"/"your_features". For each competitor listed, identify buying signals and competitive moves: funding, key hires, market expansion, strategic focus. Return ONLY JSON: {findings: [{competitor, signal_type:'funding'|'hiring'|'expansion', detail, buying_signal, urgency:'high'|'med'|'low'}]}.${GROUNDING}`,
  },
};

// ── Eval set (fixed so scores are comparable across prompt candidates) ──────────
const EVAL_CASES = [
  {
    your_idea: "A mobile-first AI notetaker that turns meetings into shareable team knowledge.",
    your_features: "real-time transcription, native mobile app, Slack integration, per-seat pricing",
    competitors: [{ name: "Otter.ai" }, { name: "Fireflies.ai" }],
    signals: [
      { competitor: "Otter.ai", source: "news", title: "Otter.ai raised $50M to expand AI meeting agents", url: "" },
      { competitor: "Otter.ai", source: "web", title: "Otter pushes 'AI Chat' across all plans", content: "Otter is marketing automated meeting agents and a generous free tier to small teams.", url: "" },
      { competitor: "Fireflies.ai", source: "web", title: "Fireflies leans into integrations + analytics", content: "Fireflies markets 100+ integrations and conversation analytics; reviews praise integrations but flag a weak mobile app.", url: "" },
    ],
  },
  {
    your_idea: "A budgeting app for freelancers with irregular income.",
    your_features: "income smoothing, tax-set-aside, simple mobile UX",
    competitors: [{ name: "YNAB" }, { name: "Rocket Money" }],
    signals: [
      { competitor: "YNAB", source: "web", title: "YNAB doubles down on its 'give every dollar a job' method", content: "YNAB markets its methodology and education; pricing rose recently, prompting churn complaints.", url: "" },
      { competitor: "Rocket Money", source: "news", title: "Rocket Money pushes subscription-cancellation in ads", content: "Heavy paid acquisition around finding and cancelling subscriptions; freemium funnel.", url: "" },
    ],
  },
];

// ── Judge ───────────────────────────────────────────────────────────────────────
async function judge(agentId, input, output) {
  const spec = AGENTS[agentId];
  const system = `You are a strict evaluator of a market-intelligence analyst agent's output. Score 0-100 on this rubric (equal weight): (1) GROUNDING — every finding is tied to the provided "signals"/competitors, no invented facts; (2) SPECIFICITY — concrete and non-generic, not boilerplate; (3) RELEVANCE — clearly useful for the user's own product ("your_idea"); (4) SCHEMA — valid JSON exactly matching ${spec.schema} with correct enum values. Return ONLY JSON: {score: 0-100, critique: "<2-3 sentences on the biggest weaknesses to fix>"}.`;
  const user = JSON.stringify({ input, agent_output: output });
  try {
    const r = await callLLM({ model: OPTIMIZER_MODEL, system, user, temperature: 0 });
    return { score: Math.max(0, Math.min(100, Number(r.score) || 0)), critique: String(r.critique || "") };
  } catch (e) {
    return { score: 0, critique: `judge error: ${e.message}` };
  }
}

async function evaluatePrompt(agentId, prompt) {
  const results = await Promise.all(
    EVAL_CASES.map(async (input) => {
      let output, critique, score;
      try {
        output = await callLLM({ model: ANALYST_MODEL, system: prompt, user: JSON.stringify(input), temperature: 0.4 });
      } catch (e) {
        return { score: 0, critique: `agent failed: ${e.message}` };
      }
      ({ score, critique } = await judge(agentId, input, output));
      return { score, critique };
    })
  );
  const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
  return { avg, critiques: results.map((r) => r.critique) };
}

// ── Optimizer (propose a better prompt from the scored history) ─────────────────
async function propose(agentId, history) {
  const spec = AGENTS[agentId];
  const best = history.reduce((a, b) => (b.avg > a.avg ? b : a));
  const system = `You are an expert prompt engineer optimizing the SYSTEM PROMPT of a market-intelligence analyst LLM agent. Improve the prompt so its output scores higher on the rubric (grounding in provided signals, specificity, relevance to the user's product, strict schema adherence). HARD REQUIREMENTS: the prompt must still instruct the model to return ONLY JSON exactly matching ${spec.schema}, stay idea-aware (uses "your_idea"/"your_features"), and ground findings in the provided "signals". Do not change the schema. Return ONLY JSON: {prompt: "<the full improved system prompt>"}.`;
  const trajectory = history
    .map((h, i) => `# Attempt ${i + 1} — score ${h.avg.toFixed(1)}\nPROMPT:\n${h.prompt}\nJUDGE CRITIQUES:\n- ${h.critiques.join("\n- ")}`)
    .join("\n\n");
  const user = `Best score so far: ${best.avg.toFixed(1)}.\n\nHistory of attempts (improve on these):\n\n${trajectory}\n\nWrite a NEW system prompt that will score higher.`;
  const r = await callLLM({ model: OPTIMIZER_MODEL, system, user, temperature: 0.8 });
  return String(r.prompt || "").trim();
}

async function optimizeAgent(agentId, rounds) {
  console.log(`\nOptimizing "${agentId}" — ${rounds} round(s), ${EVAL_CASES.length} eval cases`);
  const seed = AGENTS[agentId].seed;
  const history = [];

  const seedEval = await evaluatePrompt(agentId, seed);
  history.push({ prompt: seed, ...seedEval });
  console.log(`  seed     score ${seedEval.avg.toFixed(1)}`);

  for (let r = 1; r <= rounds; r++) {
    let candidate;
    try {
      candidate = await propose(agentId, history);
    } catch (e) {
      console.log(`  round ${r}  propose failed: ${e.message}`);
      continue;
    }
    if (!candidate || candidate.length < 40) {
      console.log(`  round ${r}  candidate rejected (too short)`);
      continue;
    }
    const evalR = await evaluatePrompt(agentId, candidate);
    history.push({ prompt: candidate, ...evalR });
    console.log(`  round ${r}  score ${evalR.avg.toFixed(1)}`);
  }

  const best = history.reduce((a, b) => (b.avg > a.avg ? b : a));
  const seedScore = history[0].avg;
  return {
    agent: agentId,
    seed_score: Number(seedScore.toFixed(1)),
    best_score: Number(best.avg.toFixed(1)),
    improvement: Number((best.avg - seedScore).toFixed(1)),
    improved_over_seed: best.prompt !== seed,
    best_prompt: best.prompt,
    history: history.map((h) => ({ score: Number(h.avg.toFixed(1)), prompt: h.prompt })),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────────
async function main() {
  const arg = (process.argv[2] || "marketing").toLowerCase();
  const rounds = Number(process.argv[3] || 2);
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing (.env.local)");
  const ids = arg === "all" ? Object.keys(AGENTS) : [arg];
  for (const id of ids) if (!AGENTS[id]) throw new Error(`unknown agent "${id}" (use marketing|product|sales|all)`);

  const results = {};
  for (const id of ids) results[id] = await optimizeAgent(id, rounds);

  writeFileSync(join(__dirname, "optimized-prompts.json"), JSON.stringify(results, null, 2));
  console.log(`\n── summary ──`);
  for (const id of ids) {
    const r = results[id];
    console.log(`  ${id.padEnd(10)} ${r.seed_score} → ${r.best_score}  (Δ ${r.improvement})`);
  }
  console.log(`→ wrote scripts/optimized-prompts.json (review before copying into src/lib/agents.js)\n`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
