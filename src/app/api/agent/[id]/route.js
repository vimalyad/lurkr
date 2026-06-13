// Generic analyst route — runs ONE of the three analyst agents (marketing/product/sales)
// against its slice of the seed data. The client fires all three in parallel so the
// dashboard can show each agent flip idle -> analyzing -> done independently.
import { NextResponse } from "next/server";
import { runAgent } from "@/lib/openrouter";
import { ANALYSTS } from "@/lib/agents";
import seed from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params; // Next 16: params is async
  const agent = ANALYSTS.find((a) => a.id === id);
  if (!agent) {
    return NextResponse.json({ ok: false, error: `Unknown agent: ${id}` }, { status: 404 });
  }

  const signals = seed[agent.inputKey];
  try {
    const result = await runAgent({
      model: agent.model,
      system: agent.system,
      user: JSON.stringify(signals),
    });
    return NextResponse.json({ agent: id, ok: true, findings: result.findings ?? [] });
  } catch (err) {
    return NextResponse.json(
      { agent: id, ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
