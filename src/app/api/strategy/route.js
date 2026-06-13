// Strategy route — synthesizes the three analysts' findings into a personalized brief for
// the user's own product: the single biggest THREAT and OPPORTUNITY, each with an action.
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

  // body = { idea, features, marketing:[...], product:[...], sales:[...] }
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
