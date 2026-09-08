import { NextResponse } from "next/server";
import { verifyElevenWebhook } from "@/lib/eleven";
import { saveChatMessage, addEscalation } from "@/lib/store";

/**
 * Post-call transcription webhook. Configure this URL in ElevenAgents
 * workspace settings and enable HMAC signing. It makes Eleven’s native call
 * history durable in Kinship too, so a completed voice session is never lost.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyElevenWebhook(raw, req.headers.get("elevenlabs-signature"))) {
    return NextResponse.json({ error: "invalid ElevenLabs signature" }, { status: 401 });
  }
  const event = JSON.parse(raw) as { type?: string; data?: Record<string, unknown> };
  const data = event.data ?? {};
  const conversationId = String(data.conversation_id ?? "unknown");
  const userId = String(data.user_id ?? "eleanor-79");

  if (event.type === "post_call_transcription" && userId === "eleanor-79") {
    const transcript = Array.isArray(data.transcript) ? data.transcript as Record<string, unknown>[] : [];
    const channel = `elevenagents:${conversationId}`;
    for (const turn of transcript) {
      const text = String(turn.message ?? "").trim();
      if (!text) continue;
      await saveChatMessage("eleanor-79", turn.role === "user" ? "user" : "assistant", text, channel);
    }
    const summary = String((data.analysis as Record<string, unknown> | undefined)?.transcript_summary ?? "").trim();
    if (summary) await saveChatMessage("eleanor-79", "system", `ElevenAgents call summary: ${summary}`, channel);
  }
  if (event.type === "call_initiation_failure") {
    await addEscalation("eleanor-79", "attention", `ElevenAgents call failed: ${String(data.failure_reason ?? "unknown reason")}.`);
  }
  return NextResponse.json({ ok: true, received: event.type ?? "unknown" });
}
