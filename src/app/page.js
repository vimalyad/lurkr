"use client";

import { useState, useCallback } from "react";

// ── Agent presentation config ────────────────────────────────────────────────
// Each analyst returns a different finding shape; this maps each to a common
// card layout (headline / tag / sub-line) so the dashboard stays uniform.
const ANALYSTS = [
  {
    id: "marketing",
    label: "Marketing AI",
    blurb: "ads · campaigns · positioning",
    headline: (f) => f.insight,
    tag: (f) => f.trend_direction,
    sub: (f) => f.signal,
  },
  {
    id: "product",
    label: "Product AI",
    blurb: "reviews · sentiment · feature gaps",
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
  const [agents, setAgents] = useState(initialAgentState);
  const [strategy, setStrategy] = useState({ status: "idle", brief: null });
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState(null);

  const setAgent = (id, patch) =>
    setAgents((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const runSweep = useCallback(async () => {
    setSweeping(true);
    setError(null);
    setStrategy({ status: "idle", brief: null });
    setAgents(initialAgentState());

    // 1) Fire the three analysts IN PARALLEL. Each card flips done as it resolves.
    ANALYSTS.forEach((a) => setAgent(a.id, { status: "analyzing", findings: [] }));

    const results = await Promise.all(
      ANALYSTS.map(async (a) => {
        try {
          const res = await fetch(`/api/agent/${a.id}`);
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

    // 2) Strategy CONSUMES the three analysts' output and synthesizes the brief.
    setStrategy({ status: "analyzing", brief: null });
    try {
      const payload = Object.fromEntries(results);
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
  }, []);

  return (
    <main className="min-h-dvh px-5 py-8 max-w-5xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lurkr</h1>
          <p className="text-sm text-neutral-400 mt-1">
            always watching, never blinking — the intelligence team that never sleeps
          </p>
        </div>
        <button
          onClick={runSweep}
          disabled={sweeping}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
        >
          {sweeping ? "Sweeping…" : "Run Intelligence Sweep"}
        </button>
      </header>

      {error && (
        <pre className="mb-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300 whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {/* Three analyst agents, side by side */}
      <section className="grid gap-4 md:grid-cols-3">
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

      {/* Strategy synthesis */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[strategy.status]}`} />
          <h2 className="font-semibold">Strategy AI</h2>
          <span className="text-xs text-neutral-500">
            synthesizes Marketing + Product + Sales →
          </span>
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
              <Brief
                kind="threat"
                title={strategy.brief.threat?.title}
                evidence={strategy.brief.threat?.evidence}
                action={strategy.brief.threat?.action}
              />
              <Brief
                kind="opportunity"
                title={strategy.brief.opportunity?.title}
                evidence={strategy.brief.opportunity?.evidence}
                action={strategy.brief.opportunity?.action}
              />
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
            {strategy.status === "analyzing"
              ? "Synthesizing the executive brief…"
              : "Run a sweep to generate the weekly executive brief."}
          </div>
        )}
      </section>
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
      <p className={`text-xs font-semibold uppercase tracking-wider ${labelColor}`}>
        {label}
      </p>
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
