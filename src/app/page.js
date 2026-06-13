"use client";

import { useState, useCallback } from "react";

// ── Agent presentation config ────────────────────────────────────────────────
const ANALYSTS = [
  {
    id: "marketing",
    label: "Marketing AI",
    blurb: "positioning · campaigns · trends",
    headline: (f) => f.insight,
    tag: (f) => f.trend_direction,
    sub: (f) => f.signal,
  },
  {
    id: "product",
    label: "Product AI",
    blurb: "sentiment · complaints · feature gaps",
    headline: (f) => f.opportunity,
    tag: (f) => f.sentiment,
    sub: (f) => f.feature_gap || f.theme,
  },
  {
    id: "sales",
    label: "Sales AI",
    blurb: "funding · hiring · expansion",
    headline: (f) => f.buying_signal,
    tag: (f) => f.urgency,
    sub: (f) => f.detail,
  },
];

const STATUS_DOT = {
  idle: "bg-neutral-600",
  analyzing: "bg-amber-400 animate-pulse",
  done: "bg-emerald-400",
  error: "bg-red-500",
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

  // 1) Find the real competitors for the user's idea.
  const discover = useCallback(async () => {
    if (!idea.trim()) return;
    setDiscovering(true);
    setError(null);
    setCompetitors([]);
    setSpace("");
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

  // 2) Analysts (parallel) over the competitors, then Strategy synthesizes for the idea.
  const runSweep = useCallback(async () => {
    if (!hasCompetitors) return;
    setSweeping(true);
    setError(null);
    setSignalCounts(null);
    setStrategy({ status: "idle", brief: null });
    setAgents(initialAgentState());

    // 0) Gather live signals for the competitors (web + news), bucketed per analyst.
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

    // 1) Analysts in parallel, each grounded in its live signal bucket.
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

  return (
    <main className="min-h-dvh px-4 sm:px-5 pb-12 max-w-5xl mx-auto">
      <header className="sticky top-0 z-30 -mx-4 sm:-mx-5 px-4 sm:px-5 py-4 mb-5 border-b border-neutral-900 bg-[#0a0a0f]/85 backdrop-blur">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Lurkr</h1>
        <p className="text-xs sm:text-sm text-neutral-400 mt-1">
          describe your idea — Lurkr finds your competitors and watches them for you
        </p>
      </header>

      {/* Step 1: the user's idea */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5">
        <label className="block text-sm font-semibold mb-1">Your startup / idea</label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={3}
          placeholder="e.g. A mobile-first AI notetaker that records meetings and turns them into shareable team knowledge."
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-indigo-600 resize-none"
        />
        <label className="block text-sm font-semibold mb-1 mt-3">
          Key features <span className="font-normal text-neutral-500">(optional)</span>
        </label>
        <textarea
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          rows={2}
          placeholder="e.g. real-time transcription, mobile app, Slack integration, per-seat pricing"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-indigo-600 resize-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={discover}
            disabled={discovering || !idea.trim()}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            {discovering ? "Finding competitors…" : hasCompetitors ? "Re-discover" : "Find my competitors"}
          </button>
          {space && <span className="text-xs text-neutral-500">space: {space}</span>}
        </div>
      </section>

      {error && (
        <pre className="mt-5 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300 whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {/* Step 2: discovered competitors */}
      {hasCompetitors && (
        <section className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold">Competitors found ({competitors.length})</h2>
              {gathering && (
                <p className="text-xs text-amber-400 mt-0.5 animate-pulse">
                  Gathering live signals (web + news)…
                </p>
              )}
              {!gathering && signalCounts && (
                <p className="text-xs text-neutral-500 mt-0.5">
                  live signals — marketing {signalCounts.marketing} · product{" "}
                  {signalCounts.product} · sales {signalCounts.sales}
                </p>
              )}
            </div>
            <button
              onClick={runSweep}
              disabled={sweeping}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              {gathering ? "Gathering…" : sweeping ? "Analyzing…" : "Run Intelligence Sweep"}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {competitors.map((c, i) => (
              <div
                key={i}
                className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.website && (
                      <a
                        href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-xs text-indigo-400 hover:underline"
                      >
                        {c.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => removeCompetitor(i)}
                    className="text-neutral-500 hover:text-red-400 text-xs"
                    aria-label={`Remove ${c.name}`}
                  >
                    ✕
                  </button>
                </div>
                {c.description && (
                  <p className="mt-1 text-xs text-neutral-400">{c.description}</p>
                )}
                {c.why_relevant && (
                  <p className="mt-1 text-[11px] text-neutral-500 italic">↳ {c.why_relevant}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Step 3: analyst agents */}
      {(sweeping || strategy.brief) && (
        <section className="mt-6 grid gap-4 md:grid-cols-3">
          {ANALYSTS.map((a) => {
            const state = agents[a.id];
            return (
              <div
                key={a.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[state.status]}`} />
                  <h2 className="font-semibold">{a.label}</h2>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">{a.blurb}</p>
                <p className="text-[11px] uppercase tracking-wider text-neutral-600 mt-2">
                  {state.status}
                </p>
                <div className="mt-3 grid gap-2">
                  {state.findings.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{f.competitor}</span>
                        {a.tag(f) && (
                          <span className="text-[10px] rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300 whitespace-nowrap">
                            {a.tag(f)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-neutral-300 leading-relaxed">
                        {a.headline(f)}
                      </p>
                      {a.sub(f) && (
                        <p className="mt-1 text-[11px] text-neutral-500 italic">↳ {a.sub(f)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Step 4: strategy brief */}
      {(strategy.status !== "idle" || strategy.brief) && (
        <section className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[strategy.status]}`} />
            <h2 className="font-semibold">Strategy AI</h2>
            <span className="text-xs text-neutral-500">brief for your product →</span>
            <span className="text-[11px] uppercase tracking-wider text-neutral-600">
              {strategy.status}
            </span>
          </div>

          {strategy.brief ? (
            <div className="rounded-2xl border border-indigo-900/60 bg-indigo-950/20 p-5">
              {strategy.brief.summary && (
                <p className="text-sm text-neutral-200 leading-relaxed">
                  {strategy.brief.summary}
                </p>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Brief kind="threat" {...(strategy.brief.threat || {})} />
                <Brief kind="opportunity" {...(strategy.brief.opportunity || {})} />
              </div>
              {Array.isArray(strategy.brief.watch_items) &&
                strategy.brief.watch_items.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">
                      Watch items
                    </p>
                    <ul className="list-disc list-inside text-sm text-neutral-300 space-y-0.5">
                      {strategy.brief.watch_items.map((w, i) => (
                        <li key={i}>{typeof w === "string" ? w : JSON.stringify(w)}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-600">
              Synthesizing the executive brief…
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Brief({ kind, title, evidence, action }) {
  const isThreat = kind === "threat";
  const accent = isThreat
    ? "border-red-900/60 bg-red-950/20"
    : "border-emerald-900/60 bg-emerald-950/20";
  const label = isThreat ? "🔴 Biggest Threat" : "🟢 Biggest Opportunity";
  const labelColor = isThreat ? "text-red-300" : "text-emerald-300";

  return (
    <div className={`rounded-xl border ${accent} p-4`}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${labelColor}`}>{label}</p>
      {title && <p className="mt-1.5 font-semibold text-neutral-100">{title}</p>}
      {evidence && <p className="mt-2 text-xs text-neutral-400 leading-relaxed">{evidence}</p>}
      {action && (
        <p className="mt-2 text-sm text-neutral-200">
          <span className="text-neutral-500">Action: </span>
          {action}
        </p>
      )}
    </div>
  );
}
