// Strategy route — the demo-winner. Receives the three analysts' findings (and optionally
// a live-injected signal) and synthesizes them into a weekly executive brief: the single
// biggest THREAT and OPPORTUNITY, each tied to evidence with a recommended action.
import { NextResponse } from "next/server";
import { runAgent } from "@/lib/openrouter";
import { STRATEGY } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // body = { marketing: [...], product: [...], sales: [...], injected?: {...} }
  try {
    const result = await runAgent({
      model: STRATEGY.model,
      system: STRATEGY.system,
      user: JSON.stringify(body),
    });
    return NextResponse.json({ agent: "strategy", ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { agent: "strategy", ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
