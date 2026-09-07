import { getAgent, fallbackReply } from "@/lib/guardian";
import { listChatMessages, saveChatMessage } from "@/lib/store";
import { sseStream, sseFallback, sseResponse } from "@/lib/stream";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? body.userId ?? "eleanor-79");
  const message = String(body.message ?? "");
  if (!message) return Response.json({ error: "message required" }, { status: 400 });

  const threadId = userId;
  await saveChatMessage(threadId, "user", message, "elder-web").catch(() => {});
  const history = await listChatMessages(threadId, 14).catch(() => []);
  const recent = history.slice(0, -1).slice(-12).map((m) => (m.role === "user" ? "Eleanor" : "Kinship") + ": " + m.content).join("\n");
  const prompt = recent ? "[user " + userId + "] Recent conversation:\n" + recent + "\nCurrent message: " + message : "[user " + userId + "] " + message;
  const persist = async (reply: string) => { if (reply.trim()) await saveChatMessage(threadId, "assistant", reply, "elder-web"); };

  const hasCreds = !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_BEARER_TOKEN_BEDROCK);
  if (!hasCreds) {
    const out = await fallbackReply(userId, message);
    return sseResponse(sseFallback(out.reply, 25, persist));
  }
  try {
    return sseResponse(sseStream(getAgent(), prompt, persist));
  } catch (e) {
    const out = await fallbackReply(userId, message);
    return sseResponse(sseFallback(out.reply, 25, persist));
  }
}
