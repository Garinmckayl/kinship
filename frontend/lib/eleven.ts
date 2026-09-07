import { createHmac, timingSafeEqual } from "crypto";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyElevenToolRequest(req: Request) {
  const secret = process.env.ELEVENLABS_TOOL_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return safeEqual(auth, `Bearer ${secret}`);
}

/** ElevenLabs-Signature is timestamped HMAC: t=<unix>,v0=<hex digest>. */
export function verifyElevenWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const i = part.indexOf("=");
    return i > 0 ? [part.slice(0, i), part.slice(i + 1)] : [part, ""];
  }));
  const timestamp = Number(parts.t ?? 0);
  const digest = parts.v0 ?? "";
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !digest) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(digest, expected);
}

export function elevenToolParams(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const nested = record.parameters ?? record.arguments ?? record.input;
  return nested && typeof nested === "object" ? nested as Record<string, unknown> : record;
}
