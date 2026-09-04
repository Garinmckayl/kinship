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

async function synth(text: string, voiceId: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const ck = key(text, voiceId);
  const hit = cache.get(ck);
  if (hit) return { blob: new Blob([hit as BlobPart], { type: "audio/mpeg" }), cached: true };

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, speed: 0.9 },
    }),
  });
  if (!res.ok) return "error";
  const buf = new Uint8Array(await res.arrayBuffer());
  cache.set(ck, buf);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return { blob: new Blob([buf as BlobPart], { type: "audio/mpeg" }), cached: false };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").slice(0, 500);
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const voiceId = String(body.voice_id ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID);
  const out = await synth(text, voiceId);
  if (out === null) return NextResponse.json({ error: "voice disabled (no ELEVENLABS_API_KEY)" }, { status: 503 });
  if (out === "error") return NextResponse.json({ error: "elevenlabs failed" }, { status: 502 });
  return new NextResponse(out.blob, { headers: { "X-Cache": out.cached ? "HIT" : "MISS" } });
}

// GET ?text= — cacheable audio URLs for Twilio <Play> on real phone calls.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const text = String(url.searchParams.get("text") ?? "").slice(0, 500);
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const voiceId = String(url.searchParams.get("voice_id") ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID);
  const out = await synth(text, voiceId);
  if (out === null) return NextResponse.json({ error: "voice disabled" }, { status: 503 });
  if (out === "error") return NextResponse.json({ error: "elevenlabs failed" }, { status: 502 });
  return new NextResponse(out.blob, { headers: { "X-Cache": out.cached ? "HIT" : "MISS", "Cache-Control": "public, max-age=86400" } });
}
