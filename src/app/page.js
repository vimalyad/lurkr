"use client";

import { useState, useCallback } from "react";

// ── Agent presentation config ────────────────────────────────────────────────
const ANALYSTS = [
  {
    id: "marketing",
    label: "Marketing",
    blurb: "positioning · campaigns · trends",
    headline: (f) => f.insight,
    tag: (f) => f.trend_direction,
    sub: (f) => f.signal,
  },
  {
    id: "product",
    label: "Product",
    blurb: "sentiment · complaints · gaps",
    headline: (f) => f.opportunity,
    tag: (f) => f.sentiment,
    sub: (f) => f.feature_gap || f.theme,
  },
  {
    id: "sales",
    label: "Sales",
    blurb: "funding · hiring · expansion",
    headline: (f) => f.buying_signal,
    tag: (f) => f.urgency,
    sub: (f) => f.detail,
  },
];

const STATUS = {
  idle: { dot: "bg-neutral-600", text: "text-neutral-500", word: "standby" },
  analyzing: { dot: "bg-[var(--color-signal)] animate-pulse", text: "text-[var(--color-signal)]", word: "analyzing" },
  done: { dot: "bg-emerald-400", text: "text-emerald-400", word: "complete" },
  error: { dot: "bg-red-500", text: "text-red-400", word: "error" },
};

const initialAgentState = () => ({
  marketing: { status: "idle", findings: [] },
  product: { status: "idle", findings: [] },
  sales: { status: "idle", findings: [] },
});

export default function Home() {
  const [idea, setIdea] = useState("");
  const [features, setFeatures] = useState("");
  const [space, setSpace] = useState("");
  const [competitors, setCompetitors] = useState([]);

  const [discovering, setDiscovering] = useState(false);
  const [agents, setAgents] = useState(initialAgentState);
  const [strategy, setStrategy] = useState({ status: "idle", brief: null });
  const [sweeping, setSweeping] = useState(false);
  const [gathering, setGathering] = useState(false);
  const [signalCounts, setSignalCounts] = useState(null);
  const [error, setError] = useState(null);

  const setAgent = (id, patch) =>
    setAgents((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const hasCompetitors = competitors.length > 0;

  const discover = useCallback(async () => {
    if (!idea.trim()) return;
    setDiscovering(true);
    setError(null);
    setCompetitors([]);
    setSpace("");
    setSignalCounts(null);
    setStrategy({ status: "idle", brief: null });
    setAgents(initialAgentState());
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, features }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Discovery failed");
      setSpace(data.space);
      setCompetitors(data.competitors);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setDiscovering(false);
    }
  }, [idea, features]);

  const removeCompetitor = (i) =>
    setCompetitors((prev) => prev.filter((_, idx) => idx !== i));

  const runSweep = useCallback(async () => {
    if (!hasCompetitors) return;
    setSweeping(true);
    setError(null);
    setSignalCounts(null);
    setStrategy({ status: "idle", brief: null });
    setAgents(initialAgentState());

    // 0) Gather live signals (web + news), bucketed per analyst.
    setGathering(true);
    let buckets = { marketing: [], product: [], sales: [] };
    try {
      const gres = await fetch("/api/gather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitors }),
      });
      const gdata = await gres.json();
      if (!gdata.ok) throw new Error(gdata.error || "Gather failed");
      buckets = { marketing: gdata.marketing, product: gdata.product, sales: gdata.sales };
      setSignalCounts(gdata.counts || null);
    } catch (err) {
      setError(String(err.message || err));
      setGathering(false);
      setSweeping(false);
      return;
    }
    setGathering(false);

    // 1) Analysts in parallel, grounded in their signal bucket.
    ANALYSTS.forEach((a) => setAgent(a.id, { status: "analyzing", findings: [] }));
    const results = await Promise.all(
      ANALYSTS.map(async (a) => {
        try {
          const res = await fetch(`/api/agent/${a.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idea, features, competitors, signals: buckets[a.id] }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || `${a.label} failed`);
          setAgent(a.id, { status: "done", findings: data.findings });
          return [a.id, data.findings];
        } catch (err) {
          setAgent(a.id, { status: "error", findings: [] });
          throw err;
        }
      })
    ).catch((err) => {
      setError(String(err.message || err));
      return null;
    });

    if (!results) {
      setSweeping(false);
      return;
    }

    // 2) Strategy synthesizes a brief for the user's product.
    setStrategy({ status: "analyzing", brief: null });
    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, features, ...Object.fromEntries(results) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Strategy failed");
      setStrategy({ status: "done", brief: data });
    } catch (err) {
      setStrategy({ status: "error", brief: null });
      setError(String(err.message || err));
    } finally {
      setSweeping(false);
    }
  }, [idea, features, competitors, hasCompetitors]);

  const busy = discovering || sweeping;

  return (
    <main className="min-h-dvh px-4 sm:px-6 pb-16 max-w-5xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="reveal pt-10 pb-7 flex items-end justify-between gap-4 border-b border-white/8">
        <div>
          <div className="label mb-2">Multi-agent market intelligence</div>
          <h1 className="font-serif text-6xl sm:text-7xl leading-[0.85] tracking-tight">
            Lurkr
          </h1>
          <p className="font-serif italic text-base sm:text-lg text-neutral-400 mt-2">
            always watching, never blinking
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pb-1">
          <span className="relative flex h-2 w-2">
            <span className="watch-ring absolute inline-flex h-full w-full rounded-full bg-[var(--color-signal)]" />
            <span className="watch-dot relative inline-flex h-2 w-2 rounded-full bg-[var(--color-signal)]" />
          </span>
          <span className="label !text-[var(--color-signal)]">Monitoring</span>
        </div>
      </header>

      {/* ── Step 1: the brief ───────────────────────────────────────────────── */}
      <section className="reveal panel mt-7 p-5 sm:p-6" style={{ animationDelay: "0.05s" }}>
        <div className="label mb-3">01 — Your product</div>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={3}
          placeholder="Describe your startup or idea — e.g. a mobile-first AI notetaker that turns meetings into shareable team knowledge."
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-[var(--color-signal)]/60 transition-colors resize-none placeholder:text-neutral-600"
        />
        <textarea
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          rows={2}
          placeholder="Key features (optional) — real-time transcription, native mobile app, Slack integration, per-seat pricing…"
          className="mt-2.5 w-full rounded-lg border border-white/10 bg-black/30 px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-[var(--color-signal)]/60 transition-colors resize-none placeholder:text-neutral-600"
        />
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={discover}
            disabled={discovering || !idea.trim()}
            className="rounded-lg bg-[var(--color-signal)] text-black hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold tracking-tight transition"
          >
            {discovering ? "Scanning the market…" : hasCompetitors ? "Re-scan" : "Find my competitors"}
          </button>
          {space && (
            <span className="label">
              space: <span className="text-neutral-300 normal-case tracking-normal">{space}</span>
            </span>
          )}
        </div>
      </section>

      {error && (
        <pre className="reveal mt-5 rounded-lg border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300 whitespace-pre-wrap mono">
          {error}
        </pre>
      )}

      {/* ── Step 2: targets ─────────────────────────────────────────────────── */}
      {hasCompetitors && (
        <section className="reveal mt-8">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <div className="label mb-1">02 — Targets acquired</div>
              <p className="font-serif text-2xl leading-none">
                {competitors.length} competitor{competitors.length === 1 ? "" : "s"}
              </p>
              {gathering && (
                <p className="label !text-[var(--color-signal)] mt-2 animate-pulse">
                  ▸ gathering live signals — web + news
                </p>
              )}
              {!gathering && signalCounts && (
                <p className="label mt-2">
                  live signals · mkt {signalCounts.marketing} · prod {signalCounts.product} · sales{" "}
                  {signalCounts.sales}
                </p>
              )}
            </div>
            <button
              onClick={runSweep}
              disabled={busy}
              className="shrink-0 rounded-lg border border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10 text-[var(--color-signal)] hover:bg-[var(--color-signal)]/20 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold tracking-tight transition"
            >
              {gathering ? "Gathering…" : sweeping ? "Analyzing…" : "Run intelligence sweep"}
            </button>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {competitors.map((c, i) => (
              <div
                key={i}
                className="reveal panel group p-3.5"
                style={{ animationDelay: `${0.04 * i}s` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-serif text-lg leading-tight">{c.name}</span>
                    {c.website && (
                      <a
                        href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block label !lowercase !tracking-wide text-neutral-500 hover:text-[var(--color-signal)] transition-colors truncate"
                      >
                        {c.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => removeCompetitor(i)}
                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 text-xs transition-opacity"
                    aria-label={`Remove ${c.name}`}
                  >
                    ✕
                  </button>
                </div>
                {c.description && (
                  <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">{c.description}</p>
                )}
                {c.why_relevant && (
                  <p className="mt-1 text-[11px] text-neutral-600 italic font-serif">
                    {c.why_relevant}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Step 3: the agents ──────────────────────────────────────────────── */}
      {(sweeping || strategy.brief) && (
        <section className="mt-9">
          <div className="label mb-4">03 — Field agents</div>
          <div className="grid gap-3 md:grid-cols-3">
            {ANALYSTS.map((a) => {
              const state = agents[a.id];
              const s = STATUS[state.status];
              return (
                <div key={a.id} className="panel p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      <h2 className="font-serif text-xl leading-none">{a.label}</h2>
                    </div>
                    <span className={`label ${s.text}`}>{s.word}</span>
                  </div>
                  <p className="label !tracking-wide !lowercase mt-1.5">{a.blurb}</p>

                  <div className="mt-3.5 grid gap-2">
                    {state.findings.map((f, i) => (
                      <div
                        key={i}
                        className="reveal rounded-lg border border-white/8 bg-black/25 p-3"
                        style={{ animationDelay: `${0.05 * i}s` }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{f.competitor}</span>
                          {a.tag(f) && (
                            <span className="label !text-[10px] rounded border border-white/10 px-1.5 py-0.5 text-neutral-300 whitespace-nowrap">
                              {a.tag(f)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs text-neutral-300 leading-relaxed">
                          {a.headline(f)}
                        </p>
                        {a.sub(f) && (
                          <p className="mt-1 text-[11px] text-neutral-600 italic">↳ {a.sub(f)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Step 4: the dossier ─────────────────────────────────────────────── */}
      {(strategy.status !== "idle" || strategy.brief) && (
        <section className="mt-9">
          <div className="flex items-center gap-2 mb-4">
            <span className="label">04 — Strategy dossier</span>
            <span className={`label ${STATUS[strategy.status].text}`}>
              · {STATUS[strategy.status].word}
            </span>
          </div>

          {strategy.brief ? (
            <div className="panel reveal p-5 sm:p-7">
              {strategy.brief.summary && (
                <p className="font-serif text-lg sm:text-xl leading-relaxed text-neutral-200">
                  {strategy.brief.summary}
                </p>
              )}
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <Brief kind="threat" {...(strategy.brief.threat || {})} />
                <Brief kind="opportunity" {...(strategy.brief.opportunity || {})} />
              </div>
              {Array.isArray(strategy.brief.watch_items) &&
                strategy.brief.watch_items.length > 0 && (
                  <div className="mt-6 border-t border-white/8 pt-4">
                    <div className="label mb-2">Watch items</div>
                    <ul className="space-y-1.5">
                      {strategy.brief.watch_items.map((w, i) => (
                        <li key={i} className="flex gap-2 text-sm text-neutral-300">
                          <span className="text-[var(--color-signal)] mono text-xs mt-0.5">▸</span>
                          <span>{typeof w === "string" ? w : JSON.stringify(w)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ) : (
            <div className="panel p-10 text-center">
              <p className="label !text-[var(--color-signal)] animate-pulse">
                synthesizing the dossier…
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Brief({ kind, title, evidence, action }) {
  const isThreat = kind === "threat";
  const accent = isThreat ? "border-red-500/30 bg-red-500/[0.06]" : "border-emerald-500/30 bg-emerald-500/[0.06]";
  const labelColor = isThreat ? "text-red-400" : "text-emerald-400";
  const label = isThreat ? "Biggest threat" : "Biggest opportunity";

  return (
    <div className={`rounded-xl border ${accent} p-4`}>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${isThreat ? "bg-red-400" : "bg-emerald-400"}`} />
        <span className={`label ${labelColor}`}>{label}</span>
      </div>
      {title && <p className="mt-2 font-serif text-xl leading-tight text-neutral-100">{title}</p>}
      {evidence && <p className="mt-2 text-xs text-neutral-400 leading-relaxed">{evidence}</p>}
      {action && (
        <p className="mt-3 text-sm text-neutral-200 leading-relaxed">
          <span className="label mr-1">Action</span>
          {action}
        </p>
      )}
    </div>
  );
}
