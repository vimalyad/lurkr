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

Lurkr is split into a static frontend (packaged as an Android APK via Capacitor) and a
backend that holds the API keys (runs on your machine — never shipped in the APK):

- **Frontend:** Vite + React + Tailwind CSS v4 → static `dist/` (→ Capacitor APK)
- **Backend:** Express (`server/`), reuses `src/lib/*`
- **OpenRouter** (OpenAI-compatible) — LLM calls (analysts on a fast model, Strategy/Discovery on a stronger one)
- **Tavily** + **Google News RSS** — live competitor signals

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your keys (used by the backend)

# two processes:
npm run server   # Express backend on :8787 (holds the keys)
npm run dev      # Vite dev on :5173 (proxies /api → :8787)
```

Open http://localhost:5173 (or `http://<LAN_IP>:5173` from your phone), describe your
idea, hit **Find my competitors**, then **Run intelligence sweep**.

Required env vars (see `.env.example`, read by the backend):

| Var | Used for | Get one |
|---|---|---|
| `OPENROUTER_API_KEY` | all LLM calls | openrouter.ai |
| `TAVILY_API_KEY` | live web-search signals | tavily.com (free tier) |

## Project layout

- `index.html`, `src/main.jsx`, `src/App.jsx` — the Vite frontend (the whole dashboard)
- `src/index.css` — Tailwind v4 + the design system
- `server/index.mjs` — Express backend: `/api/discover`, `/api/gather`, `/api/agent/:id`, `/api/strategy`, `/health`
- `src/lib/agents.js` — agent prompts + model config
- `src/lib/openrouter.js` — OpenRouter client (retry + JSON parsing)
- `src/lib/gather.js` — bucketed live-signal gathering
- `src/lib/sources/` — Tavily + Google News source clients
- `scripts/optimize-prompts.mjs` — offline prompt-optimization harness

## Android APK

The frontend packages into a sideloadable APK via Capacitor (in progress). The backend
runs on your laptop; the APK is built with `VITE_API_URL=http://<LAN_IP>:8787` so the
phone reaches it over the LAN.

## Roadmap

- **Persistence (Neon)** — store signals/findings over time, detect what's *new*
- **Scheduling (GitHub Actions)** — automatic re-sweeps, so it's always watching
- **Alerts (Resend)** — email when a new high-urgency threat appears
