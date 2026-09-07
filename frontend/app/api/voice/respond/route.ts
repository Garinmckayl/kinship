import { NextResponse } from "next/server";
import { publicBase, escXml } from "@/lib/phone";
import { chat } from "@/lib/guardian";

// Twilio posts speech-to-text here each turn. Agent replies, loop continues.
export async function POST(req: Request) {
  const base = publicBase(req);
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id") ?? "eleanor-79";
  const form = await req.formData().catch(() => null);
  const heard = String(form?.get("SpeechResult") ?? "").trim();

  if (!heard) {
    const twiml =
      `<Response><Gather input="speech" speechTimeout="auto" action="${base}/api/voice/respond?user_id=${encodeURIComponent(userId)}" method="POST">` +
      `<Say voice="Polly.Joanna-Neural" language="en-US">Sorry Eleanor, I didn't hear you. How are you feeling?</Say>` +
      `</Gather></Response>`;
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  if (/goodbye|bye|hang up|that's all/i.test(heard)) {
    return new NextResponse(
      `<Response><Say voice="Polly.Joanna-Neural" language="en-US">${escXml("Goodbye Eleanor. I'm always here if you need me.")}</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  let reply = "Thank you Eleanor, I've noted that.";
  try {
    const out = await chat(userId, `[phone call — keep reply under 40 words, simple sentences] ${heard}`, { channel: "phone" });
    reply = out.reply;
  } catch {}

  // ElevenLabs voice on real calls when publicly reachable; Twilio voice otherwise.
  let speakXml: string;
  if (base) {
    const playUrl = `${base}/api/speak?text=${encodeURIComponent(reply.slice(0, 500))}`;
    speakXml = `<Play>${escXml(playUrl)}</Play>`;
  } else {
    speakXml = `<Say voice="Polly.Joanna-Neural" language="en-US">${escXml(reply)}</Say>`;
  }

  const twiml =
    `<Response><Gather input="speech" speechTimeout="auto" action="${base}/api/voice/respond?user_id=${encodeURIComponent(userId)}" method="POST">` +
    speakXml +
    `</Gather></Response>`;
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
