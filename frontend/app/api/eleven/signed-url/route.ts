import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";

/**
 * Mints a short-lived ElevenAgents WebRTC credential for authenticated
 * caregiver sessions. The elder web demo uses the public-agent path instead;
 * this route keeps private caregiver agents and the ElevenLabs API key server-side.
 */
export async function GET() {
  try {
    await requireCaregiver();
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!agentId || !apiKey) {
      return NextResponse.json({ error: "Private ElevenAgents is not configured", configured: false }, { status: 503 });
    }
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store" }
    );
    if (!response.ok) return NextResponse.json({ error: "Unable to start ElevenAgents" }, { status: 502 });
    const body = (await response.json()) as { signed_url?: string };
    if (!body.signed_url) return NextResponse.json({ error: "ElevenLabs returned no signed URL" }, { status: 502 });
    return new NextResponse(body.signed_url, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "Unable to start ElevenAgents" }, { status: 500 });
  }
}
