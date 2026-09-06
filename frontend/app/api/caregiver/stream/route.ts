import { getSession } from "@/lib/auth";
import { getCaregiverAgent, caregiverChat } from "@/lib/caregiver";
import { sseStream, sseFallback, sseResponse } from "@/lib/stream";

export async function POST(req: Request) {
  const u = await getSession();
  if (!u) return Response.json({ error: "login required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? "");
  if (!message) return Response.json({ error: "message required" }, { status: 400 });

  const hasCreds = !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_BEARER_TOKEN_BEDROCK);
  if (!hasCreds) {
    const out = await caregiverChat(message);
    return sseResponse(sseFallback(out.reply, 12));
  }
  try {
    return sseResponse(sseStream(getCaregiverAgent(), `[caregiver ${u.name}] ${message}`));
  } catch {
    const out = await caregiverChat(message);
    return sseResponse(sseFallback(out.reply, 12));
  }
}
