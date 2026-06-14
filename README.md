<div align="center">

<img src="assets/icon-only.png" alt="Lurkr" width="116" height="116" />

# Lurkr

**Always watching, never blinking — the intelligence team that never sleeps.**

<p>
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Capacitor-7-119EFF?logo=capacitor&logoColor=white" alt="Capacitor" />
  <img src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Neon-Postgres-00E599?logo=postgresql&logoColor=white" alt="Neon" />
  <img src="https://img.shields.io/badge/OpenRouter-LLM-8A63D2" alt="OpenRouter" />
</p>

</div>

---

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
- **Neon** (Postgres) — accounts + every user's ideas and cached analyses
- **Auth** — roll-our-own on Neon: scrypt passwords + HS256 JWTs + Google sign-in (zero extra deps)
- **Daily refresh** — a GitHub Actions schedule re-runs opted-in ideas at 04:00 IST

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
| `DATABASE_URL` | accounts + saved ideas (**required**) | neon.tech (free Postgres) |
| `JWT_SECRET` | signing session tokens | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google sign-in | Google Cloud Console (OAuth web client) |
| `CRON_SECRET` | locks the daily-refresh endpoint | `openssl rand -hex 32` (also a GH secret) |

> Email verification + password reset are **disabled for now** (they need a verified
> sending domain — we need to buy one first). Email/password signup only enforces a
> unique email until then; no email provider is configured.

Frontend build-time vars (set in CI / `vite build` env, not in `.env.local`):
`VITE_API_URL` (backend base URL) and `VITE_GOOGLE_CLIENT_ID` (Google button).

## Project layout

- `index.html`, `src/main.jsx`, `src/App.jsx` — the Vite frontend (guided intake + dashboard)
- `src/index.css` — Tailwind v4 + the design system
- `src/App.jsx` — auth gate (session check, verify/reset links) → `AuthScreen` or `Dashboard`
- `src/auth/AuthScreen.jsx` — sign in / sign up + Google button
- `src/Dashboard.jsx` — the sweep UI, "My Ideas" view, daily-refresh toggle
- `server/index.mjs` — Express backend: auth (`/api/auth/*`, `/api/me`), pipeline (`/api/discover`, `/api/gather`, `/api/agent/:id`, `/api/strategy`), ideas (`/api/ideas*`), `/api/cron/daily-refresh`, `/health`
- `src/lib/auth.js` — scrypt + JWT + Google verify
- `src/lib/db.js` — Neon: users, ideas, analyses (cache), usage_events
- `src/lib/pipeline.js` — server-side full sweep (used by the daily cron)
- `src/lib/agents.js` / `openrouter.js` / `gather.js` / `sources/` — agents + signals
- `.github/workflows/daily-refresh.yml` — 04:00 IST scheduled refresh trigger
- `scripts/optimize-prompts.mjs` — offline prompt-optimization harness
- `render.yaml` — Render Blueprint for the backend
- `android/` — Capacitor Android project

## Backend hosting (Render)

The backend deploys to Render from `render.yaml` (Blueprint). Set all the env vars from the
table above in the Render dashboard. It auto-deploys on push to `main`.

## Accounts, persistence & daily refresh

- **Hard auth gate.** No session → sign in (Google, or email + password). Sessions are
  HS256 JWTs in `localStorage`. *Email verification + password reset are deferred until a
  sending domain is purchased; for now signup only requires a unique email.*
- **Per-user ideas.** Every sweep is saved under the user's idea (repeat searches of the
  same idea append a new analysis). "My Ideas" lists them; opening one serves the latest
  cached (stale-while-present) analysis. A cache miss just runs a live sweep, as before.
- **Daily refresh.** Toggle it per idea. `daily-refresh.yml` fires at 22:30 UTC (04:00 IST),
  calls the `CRON_SECRET`-protected `/api/cron/daily-refresh`, which re-runs the full sweep
  for every opted-in idea and caches the result. `CRON_SECRET` must match in **both** the
  GitHub repo secrets and the Render env.
- **Usage** is logged to `usage_events` (no billing yet — groundwork for usage-based pricing).

## Android app — automated, build-once

The APK is a thin shell: it loads the **live frontend from GitHub Pages**
(`capacitor.config.json` → `server.url`) rather than bundling its own copy. Two GitHub
Actions pipelines run on every push/merge to `main`:

1. **`deploy.yml`** — builds the frontend (with the Render API URL baked in) and publishes it
   to **GitHub Pages** (`https://vimalyad.github.io/lurkr/`). Installed apps pick up the change
   on next launch — **no reinstall**.
2. **`release-apk.yml`** — builds a **signed release APK** and attaches it to a
   **GitHub Release** (`/releases`), so there's always a fresh installable download. The
   version bumps automatically (`1.0.<run#>`); installs update in place.

So day-to-day you just `git push` — the app updates itself. You only ever build/install an
APK by hand if you want to (CI does it for you).

**Install for users:** open the repo's **Releases** page → download the latest
`lurkr-vX.Y.Z.apk` → on the phone, allow "install unknown apps" → open it.

### Signing key (one-time setup, already done)

Release builds are signed with a PKCS12 keystore stored in repo **Secrets**
(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`). A local backup lives at `lurkr-release.p12` (+ its password file),
gitignored. **Back this up somewhere safe** — if the key is lost, you can't ship in-place
updates to already-installed apps. Custom launcher icon via
`npx @capacitor/assets generate` from `assets/icon-only.png`.

## Roadmap

- **Scheduling (GitHub Actions)** — automatic re-sweeps, so it's always watching
- **Alerts (Resend)** — email when a new high-urgency threat appears
