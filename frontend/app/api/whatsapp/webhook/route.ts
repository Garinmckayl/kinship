import { NextResponse } from "next/server";
import { waConfig, sendWaText, sendWaVoice, downloadWaMedia, transcribeVoice } from "@/lib/whatsapp";
import { chat } from "@/lib/guardian";
import { publicBase } from "@/lib/phone";

// Meta webhook verification (one-time setup handshake).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

// Inbound Eleanor message -> agent -> reply (voice note if publicly reachable, text otherwise).
export async function POST(req: Request) {
  const cfg = waConfig();
  if (!cfg.ok) return NextResponse.json({ error: cfg.error }, { status: 503 });
  const body = await req.json().catch(() => ({}));

  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.from === undefined) return NextResponse.json({ ok: true, ignored: true });
  const from: string = String(msg.from);
  const userId = "eleanor-79";

  let heard = "";
  if (msg.type === "text") {
    heard = String(msg.text?.body ?? "");
  } else if (msg.type === "audio") {
    const mediaId = String(msg.audio?.id ?? "");
    const dl = await downloadWaMedia(mediaId);
    if (!dl.ok) {
      await sendWaText(from, "Eleanor, I got your voice note but couldn't hear it clearly. Could you try again? 💜");
      return NextResponse.json({ ok: true });
    }
    const tr = await transcribeVoice(dl.bytes, dl.mime);
    if (!tr.ok) {
      await sendWaText(from, "Eleanor, I got your voice note but couldn't understand it. Could you type it for me? 💜");
      return NextResponse.json({ ok: true });
    }
    heard = tr.text;
  } else {
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (!heard.trim()) return NextResponse.json({ ok: true });

  let reply = "Thank you Eleanor, I've noted that. 💜";
  try {
    const out = await chat(userId, `[whatsapp — keep reply under 40 words, simple sentences] ${heard}`, { channel: "whatsapp" });
    reply = out.reply;
  } catch {}

  // Voice note out when Twilio-style public URL exists, else plain text.
  const base = publicBase(req);
  if (base && process.env.ELEVENLABS_API_KEY) {
    const audioUrl = `${base}/api/speak?text=${encodeURIComponent(reply.slice(0, 500))}`;
    const sent = await sendWaVoice(from, audioUrl);
    if (!sent.ok) await sendWaText(from, reply);
  } else {
    await sendWaText(from, reply);
  }
  return NextResponse.json({ ok: true });
}
