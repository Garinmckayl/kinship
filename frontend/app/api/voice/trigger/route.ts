import { NextResponse } from "next/server";
import { phoneConfig, publicBase, placeCall } from "@/lib/phone";

// POST { secret, to? } — make Ruth's real phone ring. Protected by VOICE_CALLBACK_SECRET.
export async function POST(req: Request) {
  const required = process.env.VOICE_CALLBACK_SECRET;
  if (!required) return NextResponse.json({ error: "calling disabled (set VOICE_CALLBACK_SECRET)" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (body.secret !== required) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const cfg = phoneConfig();
  if (!cfg.ok) return NextResponse.json({ error: cfg.error }, { status: 503 });
  const base = publicBase(req);
  if (!base) return NextResponse.json({ error: "set PUBLIC_BASE_URL so Twilio can reach webhooks" }, { status: 503 });

  const to = String(body.to ?? cfg.elder ?? "");
  if (!to) return NextResponse.json({ error: "no destination (set ELDER_PHONE_NUMBER or pass to)" }, { status: 400 });

  const out = await placeCall(to, `${base}/api/voice/incoming?user_id=ruth-78`);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 502 });
  return NextResponse.json({ ok: true, callSid: out.sid });
}
