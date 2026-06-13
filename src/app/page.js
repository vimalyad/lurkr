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
  const [injecting, setInjecting] = useState(false);
  const [injected, setInjected] = useState(false);
  const [toast, setToast] = useState(null); // { kind, title }
  const [error, setError] = useState(null);

  const setAgent = (id, patch) =>
    setAgents((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // Run Marketing/Product/Sales in parallel, then feed all three to Strategy.
  const runSweep = useCallback(async () => {
    setSweeping(true);
    setError(null);
    setToast(null);
    setInjected(false);
    setStrategy({ status: "idle", brief: null });
    setAgents(initialAgentState());

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

    await synthesize(Object.fromEntries(results));
    setSweeping(false);
  }, []);

  // POST the analysts' findings (+ optional live signal) to the Strategy agent.
  async function synthesize(payload) {
    setStrategy({ status: "analyzing", brief: null });
    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Strategy failed");
      setStrategy({ status: "done", brief: data });
      return data;
    } catch (err) {
      setStrategy({ status: "error", brief: null });
      setError(String(err.message || err));
      return null;
    }
  }

  // Demo money-shot: drop in the held-back live signal, re-synthesize, fire the alert.
  const injectLiveSignal = useCallback(async () => {
    setInjecting(true);
    setError(null);
    try {
      const res = await fetch("/api/injected");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "No live signal");
      const signal = data.signal;

      // Show it landing on the Sales agent with a live flash.
      const liveFinding = {
        competitor: signal.competitor,
        buying_signal: signal.content,
        urgency: signal.urgency,
        detail: "LIVE — just detected",
        live: true,
      };
      const salesWithLive = [liveFinding, ...agents.sales.findings];
      setAgent("sales", { findings: salesWithLive });

      // Re-synthesize with the injected signal in the mix.
      const brief = await synthesize({
        marketing: agents.marketing.findings,
        product: agents.product.findings,
        sales: agents.sales.findings,
        injected: signal,
      });

      setInjected(true);
      if (brief?.threat) {
        setToast({ kind: "threat", title: brief.threat.title });
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setInjecting(false);
    }
  }, [agents]);

  const sweepDone = strategy.status === "done";

  return (
    <main className="min-h-dvh px-5 py-8 max-w-5xl mx-auto">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lurkr</h1>
          <p className="text-sm text-neutral-400 mt-1">
            always watching, never blinking — the intelligence team that never sleeps
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runSweep}
            disabled={sweeping || injecting}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            {sweeping ? "Sweeping…" : "Run Intelligence Sweep"}
          </button>
          {sweepDone && !injected && (
            <button
              onClick={injectLiveSignal}
              disabled={injecting}
              className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              {injecting ? "Detecting…" : "⚡ Inject Live Signal"}
            </button>
          )}
        </div>
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
                    className={`rounded-lg border p-3 ${
                      f.live
                        ? "border-red-700 bg-red-950/40 animate-live-flash"
                        : "border-neutral-800 bg-neutral-950/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {f.live && <span className="text-red-400">● LIVE </span>}
                        {f.competitor}
                      </span>
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

function Toast({ toast, onClose }) {
  const isThreat = toast.kind === "threat";
  return (
    <div
      className={`animate-toast-in fixed left-1/2 top-4 z-50 w-[min(92vw,30rem)] -translate-x-1/2 rounded-xl border p-4 shadow-2xl ${
        isThreat
          ? "border-red-600 bg-red-950/90 shadow-red-950/50"
          : "border-emerald-600 bg-emerald-950/90"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">{isThreat ? "🔴" : "🟢"}</span>
        <div className="flex-1">
          <p
            className={`text-xs font-bold uppercase tracking-wider ${
              isThreat ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {isThreat ? "Threat Detected" : "Opportunity"}
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-100">{toast.title}</p>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-200 text-sm"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
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
