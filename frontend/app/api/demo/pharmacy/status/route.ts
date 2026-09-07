import { NextResponse } from "next/server";

// Twilio callback placeholder for the live demo leg. A production connector
// would parse recording/transcription here; keeping it explicit prevents the
// UI from claiming a refill was confirmed when the pharmacy did not confirm.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  return NextResponse.json({ ok: true, callStatus: String(form?.get("DialCallStatus") ?? "unknown") });
}

