# Lurkr — Hackathon Project Context

> This file is the source of truth for the build. Read it FULLY before doing anything.
> It captures every decision already made. Do not re-litigate settled decisions; build against them.
> Companion file: `seed-data.json` (the demo dataset — already generated, ready to use).

## What we're building
**Lurkr** — a multi-agent market intelligence system. Four AI agents work together to track
competitors and surface threats/opportunities, presented in a unified dashboard with real-time alerts.
*("Lurkr" is the PRODUCT name. In the demo data, the fictional company USING Lurkr is "Synapse" — don't confuse the two.)*

- Marketing AI — monitors ads, campaigns, trends
- Product AI — analyzes reviews, feature requests, sentiment
- Sales AI — detects buying signals (funding, hiring, expansion)
- Strategy AI — synthesizes the other three into a weekly executive brief

Tagline: *Lurkr — always watching, never blinking. The intelligence team that never sleeps.*
Pitch: always-on intelligence team for startups/SMBs that don't have a market research team.

## Hard constraints (DO NOT VIOLATE)
- **~10 hours, solo dev, strong full-stack.** Ruthless scope. Build ONLY what appears on screen in the demo.
- **No native app.** Build a **PWA** (Next.js + manifest + icon, "Add to Home Screen"). Phone has NO debugging mode, so no ADB/APK/native toolchain.
- **Phone is demo-only** (iQOO). Code lives on laptop, deploy to Vercel, open URL on phone via Add-to-Home-Screen.
- **"OfficeKit" = screen mirroring the laptop only.** NOT a tool to integrate. Zero build work for it.
- NO auth, NO signup, NO real database, NO real scraping, NO continuous polling. All of these earn zero judge points.

## Architecture (DECIDED — do not deliberate)
- Single **Next.js** app, one repo, deploy to **Vercel** (one click).
- **PWA**: add manifest.json + app icon + "Add to Home Screen" support.
- **Seed data = `seed-data.json`** in the repo (already written). No DB.
- Four agents = four LLM calls (via OpenRouter) with four system prompts + four output schemas.
- State in memory (or a single JSON file).
- "Continuous/real-time monitoring" is FAKED: pre-seeded data, triggered on demand via a
  **"Run Intelligence Sweep"** button. Presented as "here's what Lurkr caught this week."
- **Responsive design = the mobile/laptop story.** Same app, two viewports. Phone = monitoring + alerts;
  laptop (mirrored) = deep report. No separate app.

## The multi-agent pattern (this is what wins — make it VISIBLE)
- Run Marketing, Product, Sales agents in **parallel** (`Promise.all`), each returning strict JSON.
- Then fire **Strategy** agent, feeding it the three agents' JSON output as input.
- On screen: show each agent's status `idle -> analyzing -> done`, findings appear as cards,
  then Strategy visibly CONSUMES the three cards and produces the brief.
- Judges must SEE agents feeding each other. Invisible orchestration looks like one chatbot.

## Agent prompts (each returns ONLY JSON, no markdown; guard parse with try/catch + 1 retry)

### Marketing AI  — input: marketing_signals from seed-data.json
"You are a marketing intelligence analyst. From the provided competitor marketing signals, identify
positioning shifts, new campaign themes, and emerging market trends. Return ONLY JSON:
{findings: [{competitor, signal, insight, trend_direction:'rising'|'flat'|'declining', confidence:0-1}]}.
Be specific and tie every insight to a concrete signal."

### Product AI  — input: product_signals from seed-data.json
"You are a product intelligence analyst. From these reviews and feature requests, extract sentiment,
recurring complaints, and feature gaps competitors are exposing. Return ONLY JSON:
{findings: [{competitor, theme, sentiment:'pos'|'neg'|'mixed', feature_gap, opportunity}]}."

### Sales AI  — input: sales_signals from seed-data.json
"You are a sales intelligence analyst. Detect buying signals and competitive moves: funding, key hires,
market expansion. Return ONLY JSON:
{findings: [{competitor, signal_type:'funding'|'hiring'|'expansion', detail, buying_signal, urgency:'high'|'med'|'low'}]}."

### Strategy AI (the demo-winner)  — input: the JSON arrays from the other three agents
"You are the chief strategy synthesizer. You receive findings from Marketing, Product, and Sales
intelligence agents. Synthesize them into a weekly executive brief. Surface the single biggest THREAT
and the single biggest OPPORTUNITY, each tied to specific findings, each with a recommended action.
Return ONLY JSON:
{summary, threat:{title, evidence, action}, opportunity:{title, evidence, action}, watch_items:[...]}.
Be specific and surprising — no generic advice."

## Seed data (DONE — see seed-data.json)
The dataset has 3 fictional competitors with INTERCONNECTED signals engineered for a non-obvious punchline:
- **Recapio** = the THREAT, spread across all 3 agents (free-tier campaign + $40M raise + SMB hiring +
  reviewers churning from paid tools => funded down-market land-grab coming for the mid-market).
- **Klarith** = the OPPORTUNITY (loud mobile complaints, #1 unbuilt feature request, zero mobile hires =>
  open flank for a mobile-first player like the demo company Synapse).
- **Driftwave** = NOISE (flat everywhere — proves the system separates signal from noise).
- `injected_signal` = held back, added LIVE during demo to fire the THREAT alert (Recapio default-integration
  distribution deal). `_expected_strategy_output` is a sanity-check target — do NOT hardcode it.

## Demo money-shots (priority order)
1. Unified dashboard: four agent cards feeding one synthesized Strategy brief.
2. Real-time **alert** ("Threat Detected" / "Opportunity") — fired by injecting one new signal LIVE.
   Use in-app TOAST alerts, NOT real web push (push is fiddly, eats time, identical for demo).
3. Mobile -> laptop story: monitor/alert on phone, deep report on mirrored laptop.

## Demo narrative (3 min, practice until muscle memory)
Open on dashboard -> hit "Run Sweep" -> four agents light up -> Strategy brief appears
-> inject the threat signal live -> alert fires. That's the climax.

## Hour-by-hour plan (PROTECT the last 1.5h)
- 0:00-1:00  Scaffold: Next.js + PWA manifest + icon + wire in seed-data.json + 4 agent prompt files. One agent returning real JSON end-to-end.
- 1:00-4:00  Full agent pipeline: all four agents, Strategy synthesizing the other three. Hardcode the "Run Sweep" trigger.
- 4:00-6:30  Dashboard UI: four agent cards + Strategy brief panel. Make it genuinely good (80% of perceived quality).
- 6:30-7:30  Alert money-shot: Threat/Opportunity toast fired by injecting injected_signal.
- 7:30-8:30  Mobile responsive view + the laptop deep-report view (same app).
- 8:30-10:00 FREEZE — no new features. Deploy to Vercel. Write a 6-line demo script. Rehearse 3x. Record a backup screen capture.

## Rules of thumb
- If the agent spine isn't working by ~4h in, cut a FEATURE, never the freeze/rehearse window.
- Quality of the Strategy brief > feature count. No generic mush; specific + surprising + tied to seed data.
- Demo narrative > feature count.
- Anything not on screen during the demo does not get built.

## LLM provider: OpenRouter (NOT Anthropic API)
We have OpenRouter credits — use those, not an Anthropic key. OpenRouter = one OpenAI-compatible API/key
for many models. Do NOT use the `api.anthropic.com/v1/messages` shape — that's a different request format.

- Key in `.env.local` as `OPENROUTER_API_KEY`. Call ONLY from server-side route handlers, never client
  components (a leaked key burns credits).
- Verify the exact model string + credit coverage in the OpenRouter dashboard before relying on it.
- Cost strategy: run the 3 analyst agents (Marketing/Product/Sales) on a cheaper/faster model; run
  Strategy on a stronger model (it's the only one where extra reasoning quality pays off).
- Use `response_format: { type: "json_object" }` + "return ONLY JSON" instruction; keep try/catch + 1 retry.

Call pattern (server-side route handler):
```js
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "anthropic/claude-sonnet-4.5", // VERIFY current id + credit coverage in dashboard
    messages: [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(seedSlice) },
    ],
    response_format: { type: "json_object" },
  }),
});
const data = await res.json();
const out = data.choices[0].message.content; // parse with try/catch + 1 retry
```

## Suggested first commands in this Claude Code session
1. "Read CLAUDE.md and seed-data.json fully. Then scaffold the Next.js PWA (manifest + icon + Add-to-Home-Screen),
   wire in seed-data.json, and create the 4 agent prompt files per the 0:00-1:00 plan. Get ONE agent
   (Marketing) returning real JSON from the seed data end-to-end before building anything else."
2. Then proceed through the hour-by-hour plan. Keep this file updated as steps complete.

## Status log (update as you go)
- [x] Plan + architecture locked
- [x] Seed data generated (seed-data.json)
- [x] Scaffold + one agent working end-to-end (Next.js 16 PWA + Marketing AI returning real JSON via OpenRouter)
- [ ] Full 4-agent pipeline
- [ ] Dashboard UI
- [ ] Alert money-shot
- [ ] Mobile/laptop views
- [ ] Deploy + rehearse