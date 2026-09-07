import { NextResponse } from "next/server";
import { waConfig, sendWaText, sendWaVoice } from "@/lib/whatsapp";
import { publicBase } from "@/lib/phone";

// POST { secret, to?, text } — agent-initiated WhatsApp message (text or voice note).
// Protected by VOICE_CALLBACK_SECRET (shared with voice trigger).
export async function POST(req: Request) {
  const required = process.env.VOICE_CALLBACK_SECRET;
  if (!required) return NextResponse.json({ error: "sending disabled (set VOICE_CALLBACK_SECRET)" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (body.secret !== required) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const cfg = waConfig();
  if (!cfg.ok) return NextResponse.json({ error: cfg.error }, { status: 503 });
  const to = String(body.to ?? cfg.elder ?? "");
  if (!to) return NextResponse.json({ error: "no destination (set ELDER_WHATSAPP_NUMBER or pass to)" }, { status: 400 });
  const text = String(body.text ?? "Hi Eleanor, it's ElderLove checking on you. Did you take your morning pill? 💜");

  const base = publicBase(req);
  if (base && process.env.ELEVENLABS_API_KEY) {
    const audioUrl = `${base}/api/speak?text=${encodeURIComponent(text.slice(0, 500))}`;
    const sent = await sendWaVoice(to, audioUrl);
    if (sent.ok) return NextResponse.json({ ok: true, kind: "voice" });
    // fall through to text on audio failure
  }
  const sent = await sendWaText(to, text);
  if (!sent.ok) return NextResponse.json({ error: (sent as { error: string }).error }, { status: 502 });
  return NextResponse.json({ ok: true, kind: "text" });
}
