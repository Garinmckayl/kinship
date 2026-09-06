import { getAgent, fallbackReply } from "@/lib/guardian";
import { sseStream, sseFallback, sseResponse } from "@/lib/stream";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? body.userId ?? "ruth-78");
  const message = String(body.message ?? "");
  if (!message) return Response.json({ error: "message required" }, { status: 400 });

  const hasCreds = !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_BEARER_TOKEN_BEDROCK);
  if (!hasCreds) {
    const out = await fallbackReply(userId, message);
    return sseResponse(sseFallback(out.reply));
  }
  try {
    return sseResponse(sseStream(getAgent(), `[user ${userId}] ${message}`));
  } catch (e) {
    const out = await fallbackReply(userId, message);
    return sseResponse(sseFallback(out.reply));
  }
}
