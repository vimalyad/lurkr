// Discovery: given the user's own idea/features, find the real competitors in that space.
import { NextResponse } from "next/server";
import { runAgent } from "@/lib/openrouter";
import { DISCOVERY } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { idea, features } = body || {};
  if (!idea || !idea.trim()) {
    return NextResponse.json({ ok: false, error: "Describe your idea first." }, { status: 400 });
  }

  try {
    const result = await runAgent({
      model: DISCOVERY.model,
      system: DISCOVERY.system,
      user: JSON.stringify({ your_idea: idea, your_features: features || "" }),
    });
    return NextResponse.json({
      ok: true,
      space: result.space || "",
      competitors: Array.isArray(result.competitors) ? result.competitors : [],
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
