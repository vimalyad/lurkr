<div align="center">

# Lurkr — System Architecture

**A multi-agent competitive-intelligence platform: a thin-client mobile shell over a
remote-hosted SPA, a stateless API tier, a grounded multi-agent LLM pipeline, and a
read-through analysis cache warmed by a scheduled batch job.**

</div>

---

## 1. Executive summary

Lurkr turns a one-line product description into a personalised strategic brief — the single
biggest **threat** and **opportunity** for *your* product — by discovering real competitors,
grounding a team of specialised AI agents in live market signals, and synthesising the result.

The system is built around five architectural pillars:

1. **Build-once mobile delivery** — the Android app is a thin Capacitor WebView shell that loads
   a remotely-hosted SPA, so product iterations ship via `git push`, not APK rebuilds.
2. **Secret-isolating tiered topology** — every API key and the entire data plane live behind a
   stateless Express tier; nothing sensitive ever crosses the client boundary.
3. **Grounded multi-agent orchestration** — a fan-out/fan-in pipeline of LLM agents, each
   constrained to cite live retrieved evidence (retrieval-augmented, low-hallucination).
4. **Zero-dependency cryptographic auth** — scrypt password hashing and HMAC-signed JWT sessions
   built entirely on the Node standard library; no auth SDK, no session store.
5. **Stale-while-present caching + scheduled reconciliation** — per-user analyses are cached and
   refreshed by a nightly cron, with instant live fallback on a cache miss.

---

## 2. System topology

```
                          ┌─────────────────────────────────────────────┐
                          │                CLIENTS                      │
                          │                                             │
   ┌──────────────┐       │   Android APK              Web browser      │
   │  Capacitor 7 │       │  (thin WebView shell)     (any device)      │
   │  native shell│──────▶│         │                      │            │
   └──────────────┘       │         └───────── loads ──────┘            │
                          └───────────────────┬─────────────────────────┘
                                              │ HTTPS  (Bearer JWT)
                                              ▼
                          ┌─────────────────────────────────────────────┐
                          │     STATIC EDGE — GitHub Pages (CDN)         │
                          │   React 19 + Vite 6 SPA, Tailwind v4         │
                          │   (auto-deployed by GitHub Actions)          │
                          └───────────────────┬─────────────────────────┘
                                              │ /api/*   (relative → VITE_API_URL)
                                              ▼
                          ┌─────────────────────────────────────────────┐
                          │   APPLICATION TIER — Express on Render       │
                          │   • stateless auth middleware (JWT verify)   │
                          │   • multi-agent pipeline orchestration       │
                          │   • read-through cache + cron endpoint       │
                          │   • holds ALL secrets (keys never leave here)│
                          └───┬───────────────┬───────────────┬─────────┘
                              │               │               │
                ┌─────────────▼──┐   ┌────────▼────────┐   ┌──▼──────────────┐
                │ Neon Postgres  │   │  OpenRouter     │   │ Tavily +        │
                │ users · ideas  │   │  (LLM gateway)  │   │ Google News RSS │
                │ analyses cache │   │  analysts·strat │   │ (live signals)  │
                │ usage_events   │   └─────────────────┘   └─────────────────┘
                └────────────────┘

   ┌───────────────────────────────────────────────────────────────────────┐
   │  CONTROL PLANE — GitHub Actions                                         │
   │  ci.yml (build gate) · deploy.yml (Pages) · release-apk.yml (signed APK)│
   │  daily-refresh.yml (22:30 UTC ≡ 04:00 IST → protected cron endpoint)    │
   └───────────────────────────────────────────────────────────────────────┘
```

---

## 3. The intelligence pipeline (fan-out / fan-in)

The core domain logic is a **four-stage multi-agent orchestration** that is *grounded* — every
analytical claim must reference concrete retrieved evidence rather than parametric model memory.

```
  Idea + features
        │
        ▼
  ① Discovery agent ───────────► identifies real, operating competitors  (recall-optimised model)
        │
        ▼
  ② Signal gathering ──────────► per-competitor fan-out across heterogeneous sources
        │                         (Tavily web search + Google News RSS), bucketed per analyst
        ▼
  ③ Analyst fan-out  ──────────► Marketing ∥ Product ∥ Sales  (run concurrently, fast model)
        │                         each grounded ONLY in its signal bucket
        ▼
  ④ Strategy fan-in  ──────────► synthesises a single executive brief: THREAT + OPPORTUNITY
                                  + watch-items  (synthesis-optimised model)
```

**Design properties**

- **Model tiering / cost-aware routing.** Breadth tasks (the three analysts) run on a fast,
  inexpensive model; high-judgement tasks (discovery recall, final synthesis) run on a stronger
  model. Routing is abstracted through an OpenAI-compatible gateway (OpenRouter).
- **Grounding / RAG discipline.** Analyst prompts mandate citation of the provided signals and
  require explicit low-confidence flags when evidence is sparse — a deliberate
  anti-hallucination contract.
- **Per-source fault isolation (graceful degradation).** Each signal source is wrapped so a
  failure yields an empty bucket instead of cascading — the sweep always completes.
- **Bounded-retry, lenient deserialization.** LLM responses are parsed with a fenced-JSON-tolerant
  decoder and a single retry, hardening against formatting drift.
- **Offline prompt optimisation (OPRO / LLM-as-judge).** `scripts/optimize-prompts.mjs` is an
  out-of-band automatic-prompt-optimisation harness: it scores candidate system prompts with a
  rubric-driven LLM judge and iteratively proposes improvements. The current analyst prompts are
  its winners — promoted into the codebase after human review, never mutating the request path.

---

## 4. Authentication & session model

Rolled in-house on the **Node standard library — zero third-party auth dependencies.**

| Concern | Mechanism | Heavy-word framing |
|---|---|---|
| Password storage | `scrypt` KDF, per-user random salt, constant-time compare | memory-hard key derivation, timing-attack-resistant verification |
| Sessions | HS256 JWT (HMAC-SHA256 over the standard library) | **stateless, horizontally-scalable** session layer — no server-side session store |
| Google sign-in | Google Identity Services **ID-token flow**, verified via `tokeninfo` | secret-less federated identity; audience-pinned token validation |
| Transport of identity | `Authorization: Bearer` + global `401 → re-auth` event bus | uniform credential propagation; centralised session-expiry handling |
| Gating | hard gate — no valid session, no app | deny-by-default access control |

Notable: the Google **client secret is never used** — the browser obtains a signed ID token and
the backend validates it against Google's public endpoint, so there is no server-side
code-exchange and no secret to leak. *(Email verification + password reset are intentionally
deferred until a verified sending domain is provisioned.)*

---

## 5. Data model & caching

**Neon (serverless Postgres)** with **idempotent migrations** applied on boot
(`CREATE TABLE IF NOT EXISTS …`), so deploys are safe and order-independent.

```
users ──< ideas ──< analyses        (1-to-many, ON DELETE CASCADE)
              │
              └──< usage_events      (append-only usage ledger → future usage-based billing)
```

- `ideas` carries a per-idea `daily_refresh` opt-in flag (partial index for cheap cron lookup).
- `analyses` is an **append-only snapshot log** — the newest row per idea *is* the cache.

**Read-through, stale-while-present cache.** Opening a saved idea serves the most recent stored
analysis immediately — even if stale — while a **cache miss falls through to a live sweep** that
is then persisted. Repeat searches of the same idea append snapshots rather than duplicating the
idea (find-or-create deduplication), giving free refresh history.

---

## 6. Scheduled reconciliation (the daily cron)

A **GitHub Actions schedule** (`22:30 UTC ≡ 04:00 Asia/Kolkata`) acts as an external,
sleep-proof trigger — chosen over in-process timers precisely because the free compute tier
idles out. It calls a **shared-secret-protected** endpoint (`X-Cron-Secret`), which performs a
**batch cache-warming reconciliation**: every idea opted into daily refresh is re-swept
server-side via the shared pipeline module and its analysis snapshot is rewritten. The endpoint
responds immediately and processes asynchronously (fire-and-forget background work).

---

## 7. Delivery & CI/CD (build-once)

- **Thin-client distribution.** The APK is a Capacitor shell whose WebView loads the live
  GitHub Pages SPA (`server.url`). Frontend changes propagate on app relaunch — **no rebuild,
  no reinstall** — collapsing the mobile release loop to a `git push`.
- **Cryptographically-signed artifact pipeline.** `release-apk.yml` builds and **PKCS12-signs** a
  release APK on every merge, auto-increments the version, and publishes it to GitHub Releases as
  the canonical install channel — fully reproducible, no local Android toolchain required.
- **Build gate.** `ci.yml` compiles the SPA on every PR/push, catching broken imports before
  merge.
- **Continuous deployment.** `deploy.yml` builds and publishes the SPA to the Pages CDN; the
  backend auto-deploys from `render.yaml` on push to `main`.
- **Least-privilege secret management.** Build/runtime secrets are sealed-box-encrypted into
  GitHub Actions secrets and Render env; the signing key and API keys never touch the repo or the
  client bundle.

---

## 8. Feature inventory

**User-facing**
- Guided intake wizard (product → features → confirm).
- AI competitor discovery from a free-text idea.
- Live multi-source signal gathering (web + news) per competitor.
- Three concurrent specialist analysts (Marketing / Product / Sales), evidence-grounded.
- Synthesised strategy dossier: biggest threat + opportunity + watch-items, each with an action.
- Accounts (Google or email + password), hard-gated.
- Per-user saved ideas with a "My Ideas" library.
- Cached (instant) re-open of past analyses; live re-run on demand.
- Per-idea daily auto-refresh at 04:00 IST.
- Cross-platform: installable Android APK **and** browser, same backend.

**Engineering**
- Zero-dependency in-house auth (scrypt + HMAC JWT + federated Google ID token).
- Stale-while-present read-through cache with live fallback.
- Fault-isolated, best-effort source fan-out.
- Bounded-retry, format-tolerant LLM deserialization.
- Idempotent schema migrations.
- LLM-as-judge offline prompt optimisation harness.
- Signed, auto-versioned APK release pipeline + zero-rebuild OTA-style frontend updates.

---

## 9. Optimisations & engineering decisions

| Decision | Rationale / payoff |
|---|---|
| Thin-shell APK over remote SPA | Eliminates the rebuild/reinstall loop; ship UI by pushing code. |
| Zero new deps for auth + email + Google | No `package-lock` churn, smaller supply-chain surface, faster cold starts. |
| Model tiering via OpenRouter | Spend strong-model budget only on high-judgement stages. |
| Parallel analyst fan-out | Wall-clock ≈ slowest single agent, not the sum. |
| Per-source `safe()` isolation | One flaky source can't fail the sweep (graceful degradation). |
| Stateless JWT sessions | No session store; trivially horizontally scalable. |
| Stale-while-present cache | Sub-second reads for returning users; live only on true miss. |
| External cron vs in-process timer | Survives free-tier instance idling; decoupled & observable. |
| Idempotent migrations on boot | Zero-ceremony, order-independent, safe redeploys. |
| Append-only usage ledger | Drop-in foundation for future usage-based billing. |

---

## 10. Security posture

- **Secret isolation:** all third-party keys and the data plane sit behind the API tier; the
  client bundle ships *no* secrets.
- **Deny-by-default gate:** unauthenticated requests are rejected at the middleware boundary;
  the user is re-loaded from the DB each request so revocation is immediate.
- **Credential hygiene:** memory-hard password hashing, constant-time verification, audience-pinned
  Google tokens, signed-but-stateless sessions.
- **Protected automation:** the cron endpoint is gated by a shared secret synchronised across
  GitHub and Render.
- **Supply-chain minimalism:** the auth, email, and identity surfaces use the Node standard
  library and `fetch` only.

---

## 11. Talking points (the heavy words, in one breath)

> Lurkr is a **multi-agent, retrieval-augmented competitive-intelligence platform**. A
> **thin-client Capacitor shell** renders a **CDN-hosted React SPA** against a **stateless,
> secret-isolating Express tier**. The domain core is a **grounded fan-out/fan-in LLM
> orchestration** with **cost-aware model tiering**, **per-source fault isolation**, and
> **bounded-retry deserialization**, tuned by an **LLM-as-judge prompt-optimisation harness**.
> Identity is **zero-dependency in-house auth** — **scrypt KDF**, **HMAC-signed stateless JWTs**,
> and **secret-less federated Google ID-token verification**. Reads are served from a
> **stale-while-present read-through cache** over **serverless Postgres** with **idempotent
> migrations**, warmed nightly by an **externally-triggered batch reconciliation cron**. Delivery
> is **build-once**: a **cryptographically-signed, auto-versioned APK pipeline** plus
> **zero-rebuild OTA-style frontend updates**, all under **least-privilege, sealed-box secret
> management**.

---

*Stack: React 19 · Vite 6 · Tailwind v4 · Capacitor 7 · Express · Neon Postgres · OpenRouter ·
Tavily · Google News · GitHub Actions · Render.*
