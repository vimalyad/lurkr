"use client";

import { useState } from "react";

// Minimal scaffold page for the 0:00-1:00 milestone: a button that runs the Marketing
// agent against the seed data and shows the real JSON it returns. The full four-agent
// dashboard gets built on top of this spine in the next hours.
export default function Home() {
  const [status, setStatus] = useState("idle"); // idle | analyzing | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runMarketing() {
    setStatus("analyzing");
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/marketing");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Agent failed");
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err.message || err));
      setStatus("error");
    }
  }

  return (
    <main className="min-h-dvh px-5 py-8 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Lurkr</h1>
        <p className="text-sm text-neutral-400 mt-1">
          always watching, never blinking — the intelligence team that never sleeps
        </p>
      </header>

      <button
        onClick={runMarketing}
        disabled={status === "analyzing"}
        className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
      >
        {status === "analyzing" ? "Analyzing…" : "Run Marketing AI"}
      </button>

      <div className="mt-4">
        <span className="text-xs uppercase tracking-wider text-neutral-500">
          Marketing AI · {status}
        </span>
      </div>

      {error && (
        <pre className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300 whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {result?.findings && (
        <div className="mt-6 grid gap-3">
          {result.findings.map((f, i) => (
            <div
              key={i}
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{f.competitor}</span>
                <span className="text-xs rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300">
                  {f.trend_direction}
                  {typeof f.confidence === "number"
                    ? ` · ${Math.round(f.confidence * 100)}%`
                    : ""}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-300">{f.insight}</p>
              {f.signal && (
                <p className="mt-2 text-xs text-neutral-500 italic">↳ {f.signal}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
