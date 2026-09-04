import { NextResponse } from "next/server";
import { createHash } from "crypto";

// Warm, reassuring guardian voice for elders. Override with ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah — Mature, Reassuring, Confident
const MODEL_ID = "eleven_turbo_v2_5"; // fast + cheap, still warm

// Tiny in-memory cache so repeated demo lines cost zero credits.
const cache = new Map<string, Uint8Array>();
const MAX_CACHE = 50;

function key(text: string, voiceId: string) {
  return createHash("sha256").update(`${voiceId}:${text}`).digest("hex");
}

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "voice disabled (no ELEVENLABS_API_KEY)" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").slice(0, 500);
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const voiceId = String(body.voice_id ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID);

  const ck = key(text, voiceId);
  const hit = cache.get(ck);
  if (hit) return new NextResponse(new Blob([hit as BlobPart], { type: "audio/mpeg" }), { headers: { "X-Cache": "HIT" } });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, speed: 0.9 },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return NextResponse.json({ error: `elevenlabs ${res.status}`, detail: err.slice(0, 300) }, { status: 502 });
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  cache.set(ck, buf);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return new NextResponse(new Blob([buf as BlobPart], { type: "audio/mpeg" }), { headers: { "X-Cache": "MISS" } });
}
