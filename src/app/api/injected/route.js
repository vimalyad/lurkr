// Returns the held-back "live" signal. Added on demand during the demo (after the first
// sweep) to escalate the Recapio threat from emerging -> urgent and fire the THREAT alert.
import { NextResponse } from "next/server";
import seed from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, signal: seed.injected_signal });
}
