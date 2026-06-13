# Lurkr

**Always watching, never blinking — the intelligence team that never sleeps.**

Lurkr is a multi-agent market intelligence system. Four AI agents work together to track
competitors and surface threats and opportunities, presented in a unified dashboard with
real-time alerts.

- **Marketing AI** — monitors ads, campaigns, and positioning shifts
- **Product AI** — analyzes reviews, feature requests, and sentiment
- **Sales AI** — detects buying signals (funding, hiring, expansion)
- **Strategy AI** — synthesizes the other three into a weekly executive brief

## Stack

- Next.js 16 (App Router) — single app, deploys to Vercel
- PWA (manifest + icon + Add-to-Home-Screen)
- Tailwind CSS v4
- OpenRouter (OpenAI-compatible) for the LLM calls

## Getting started

```bash
npm install
# add your OpenRouter key
echo 'OPENROUTER_API_KEY="sk-or-..."' > .env.local
npm run dev
```

Open http://localhost:3000 and hit **Run** to watch the agents work.

## Architecture

The three analyst agents (Marketing, Product, Sales) run in parallel, each returning strict
JSON. Their combined output is then fed to the Strategy agent, which produces the executive
brief. Agent prompts and models live in `src/lib/agents.js`; the OpenRouter client lives in
`src/lib/openrouter.js`.
