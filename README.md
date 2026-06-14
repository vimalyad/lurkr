# Lurkr

**Always watching, never blinking — the intelligence team that never sleeps.**

Lurkr is a multi-agent market intelligence tool. You describe **your own** startup or idea;
Lurkr finds the real competitors in that space, gathers live data on them, and a team of AI
agents turns it into a personalized brief — the single biggest **threat** and **opportunity**
for your product, each with a recommended action.

## How it works

```
Guided intake:  Product → Key features (optional) → Confirm
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
                           (persisted to Postgres / Neon)
```

The three analysts run in parallel; their findings feed the Strategy agent, which synthesizes
the brief for *your* product.

## Stack

Lurkr is split into a static frontend (packaged as an Android APK via Capacitor) and an
Express backend that holds the API keys (runs locally in dev, hosted on Render in production —
never shipped inside the APK):

- **Frontend:** Vite + React + Tailwind CSS v4 → static `dist/` (→ Capacitor APK)
- **Backend:** Express (`server/`), reuses `src/lib/*`; hosted on **Render**
- **OpenRouter** (OpenAI-compatible) — LLM calls (analysts on a fast model, Strategy/Discovery on a stronger one)
- **Tavily** + **Google News RSS** — live competitor signals
- **Neon** (Postgres) — persists every sweep (optional, gated on `DATABASE_URL`)

## Getting started (local dev)

```bash
npm install
cp .env.example .env.local   # then fill in your keys (used by the backend)

# two processes:
npm run server   # Express backend on :8787 (holds the keys)
npm run dev      # Vite dev on :5173 (proxies /api → :8787)
```

Open http://localhost:5173 (or `http://<LAN_IP>:5173` from your phone), describe your
idea, **Find my competitors**, then **Run intelligence sweep**.

Env vars (see `.env.example`, read by the backend):

| Var | Used for | Get one |
|---|---|---|
| `OPENROUTER_API_KEY` | all LLM calls | openrouter.ai |
| `TAVILY_API_KEY` | live web-search signals | tavily.com (free tier) |
| `DATABASE_URL` | persistence (optional) | neon.tech (free Postgres) |

## Project layout

- `index.html`, `src/main.jsx`, `src/App.jsx` — the Vite frontend (guided intake + dashboard)
- `src/index.css` — Tailwind v4 + the design system
- `server/index.mjs` — Express backend: `/api/discover`, `/api/gather`, `/api/agent/:id`, `/api/strategy`, `/api/history`, `/health`
- `src/lib/agents.js` — agent prompts + model config
- `src/lib/openrouter.js` — OpenRouter client (retry + JSON parsing)
- `src/lib/gather.js` — bucketed live-signal gathering
- `src/lib/db.js` — optional Neon persistence
- `src/lib/sources/` — Tavily + Google News source clients
- `scripts/optimize-prompts.mjs` — offline prompt-optimization harness
- `render.yaml` — Render Blueprint for the backend
- `android/` — Capacitor Android project

## Backend hosting (Render)

The backend deploys to Render from `render.yaml` (Blueprint). Set `OPENROUTER_API_KEY`,
`TAVILY_API_KEY`, and `DATABASE_URL` in the Render dashboard. It auto-deploys on push to `main`.

## Android APK

```bash
# point the build at the hosted backend, then package
VITE_API_URL=https://<your-render-app>.onrender.com npm run build
npx cap sync android
cd android && JAVA_HOME="<Android Studio JBR>" ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Install by copying the APK to the phone (File-transfer USB drag, or download over Wi-Fi /
any channel) → "install unknown apps" → install. The installed app talks to the hosted
backend, so it works on any network. Custom launcher icon via `npx @capacitor/assets generate`
from `assets/icon-only.png`.

## Roadmap

- **Scheduling (GitHub Actions)** — automatic re-sweeps, so it's always watching
- **Alerts (Resend)** — email when a new high-urgency threat appears
