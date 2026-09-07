import { NextResponse } from "next/server";
import { verifyElevenToolRequest, elevenToolParams } from "@/lib/eleven";
import { runPharmacyRefill } from "@/lib/demo-lab";

/** ElevenAgents webhook tool: runs the same pharmacy worker as the Demo Lab. */
export async function POST(req: Request) {
  if (!verifyElevenToolRequest(req)) return NextResponse.json({ error: "invalid ElevenLabs tool credentials" }, { status: 401 });
  const input = elevenToolParams(await req.json().catch(() => ({})));
  const result = await runPharmacyRefill({ medication: String(input.medication ?? "Lisinopril 10 mg"), live: input.live === true });
  return NextResponse.json({ ok: true, ...result });
}
