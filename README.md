# Lurkr

**Always watching, never blinking — the intelligence team that never sleeps.**

Lurkr is a multi-agent market intelligence tool. You describe **your own** startup or idea;
Lurkr finds the real competitors in that space, gathers live data on them, and a team of AI
agents turns it into a personalized brief — the single biggest **threat** and **opportunity**
for your product, each with a recommended action.

## How it works

```
Your idea + features
        │
        ▼
  Discovery AI ──────────► finds the real competitors in your space
        │
        ▼
  Gather (live data) ────► web search (Tavily) + news (Google News) per competitor
        │
        ▼
  Marketing · Product · Sales AI  (run in parallel, grounded in the live signals)
        │
        ▼
  Strategy AI ───────────► personalized brief: biggest THREAT + OPPORTUNITY + watch items
```

The three analysts run in parallel; their findings feed the Strategy agent, which synthesizes
the brief for *your* product.

## Stack

- **Next.js 16** (App Router) — one app, frontend + API route handlers, deploys to Vercel
- **PWA** — manifest + icon + Add-to-Home-Screen
- **Tailwind CSS v4**
- **OpenRouter** (OpenAI-compatible) — LLM calls (analysts on a fast model, Strategy/Discovery on a stronger one)
- **Tavily** + **Google News RSS** — live competitor signals

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

Required env vars (see `.env.example`):

| Var | Used for | Get one |
|---|---|---|
| `OPENROUTER_API_KEY` | all LLM calls | openrouter.ai |
| `TAVILY_API_KEY` | live web-search signals | tavily.com (free tier) |

Open http://localhost:3000, describe your idea, hit **Find my competitors**, then
**Run Intelligence Sweep**.

## Project layout

- `src/app/page.js` — the dashboard (orchestrates the whole flow client-side)
- `src/app/api/discover` — finds competitors from your idea
- `src/app/api/gather` — collects live signals per competitor (bucketed for each analyst)
- `src/app/api/agent/[id]` — runs one analyst (marketing / product / sales), grounded in signals
- `src/app/api/strategy` — synthesizes the personalized brief
- `src/lib/agents.js` — agent prompts + model config
- `src/lib/openrouter.js` — OpenRouter client (retry + JSON parsing)
- `src/lib/sources/` — Tavily + Google News source clients

## Roadmap

- **Persistence (Neon)** — store signals/findings over time, detect what's *new*
- **Scheduling (GitHub Actions)** — automatic re-sweeps, so it's always watching
- **Alerts (Resend)** — email when a new high-urgency threat appears
