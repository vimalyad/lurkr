// Generic analyst route — runs ONE of the three analysts (marketing/product/sales) over
// the discovered competitors, with the user's own idea as context. POST so the client can
// pass {idea, features, competitors}. Fired for all three in parallel from the dashboard.
import { NextResponse } from "next/server";
import { runAgent } from "@/lib/openrouter";
import { ANALYSTS } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const { id } = await params; // Next 16: params is async
  const agent = ANALYSTS.find((a) => a.id === id);
  if (!agent) {
    return NextResponse.json({ ok: false, error: `Unknown agent: ${id}` }, { status: 404 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { idea, features, competitors, signals } = body || {};
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return NextResponse.json({ ok: false, error: "No competitors to analyze." }, { status: 400 });
  }

  try {
    const result = await runAgent({
      model: agent.model,
      system: agent.system,
      user: JSON.stringify({
        your_idea: idea || "",
        your_features: features || "",
        competitors,
        signals: Array.isArray(signals) ? signals : [],
      }),
    });
    return NextResponse.json({ agent: id, ok: true, findings: result.findings ?? [] });
  } catch (err) {
    return NextResponse.json(
      { agent: id, ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
