import { getSession } from "@/lib/auth";
import { listChatMessages, saveChatMessage } from "@/lib/store";
import { getCaregiverAgent, caregiverChat } from "@/lib/caregiver";
import { sseStream, sseFallback, sseResponse } from "@/lib/stream";

export async function POST(req: Request) {
  const u = await getSession();
  if (!u) return Response.json({ error: "login required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? "");
  if (!message) return Response.json({ error: "message required" }, { status: 400 });

  const threadId = "caregiver:" + u.id;
  await saveChatMessage(threadId, "user", message, "caregiver-web").catch(() => {});
  const history = await listChatMessages(threadId, 14).catch(() => []);
  const recent = history.slice(0, -1).slice(-12).map((m) => (m.role === "user" ? u.name : "Kinship") + ": " + m.content).join("\n");
  const prompt = recent ? "[caregiver " + u.name + "] Recent conversation:\n" + recent + "\nCurrent message: " + message : "[caregiver " + u.name + "] " + message;
  const persist = async (reply: string) => { if (reply.trim()) await saveChatMessage(threadId, "assistant", reply, "caregiver-web"); };

  const hasCreds = !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_BEARER_TOKEN_BEDROCK);
  if (!hasCreds) {
    const out = await caregiverChat(message);
    return sseResponse(sseFallback(out.reply, 12, persist));
  }
  try {
    return sseResponse(sseStream(getCaregiverAgent(), prompt, persist));
  } catch {
    const out = await caregiverChat(message);
    return sseResponse(sseFallback(out.reply, 12, persist));
  }
}
