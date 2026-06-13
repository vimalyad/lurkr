// 0:00-1:00 milestone route: ONE agent (Marketing) returning real JSON from the seed data,
// end-to-end through OpenRouter. Hit GET /api/marketing to verify the spine works.
import { NextResponse } from "next/server";
import { runAgent } from "@/lib/openrouter";
import { ANALYSTS } from "@/lib/agents";
import seed from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const marketing = ANALYSTS.find((a) => a.id === "marketing");
  const signals = seed[marketing.inputKey];

  try {
    const result = await runAgent({
      model: marketing.model,
      system: marketing.system,
      user: JSON.stringify(signals),
    });
    return NextResponse.json({ agent: "marketing", ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { agent: "marketing", ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
