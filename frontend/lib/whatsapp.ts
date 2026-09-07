// WhatsApp voice loop via Meta Cloud API (FREE — no PSTN, works in Ethiopia).
// Agent -> Eleanor: ElevenLabs MP3 sent as WhatsApp audio message (voice note).
// Eleanor -> agent: text or voice note (voice transcribed via ElevenLabs Scribe).
// Zero new deps: raw Graph API fetch. Without creds everything 503s gracefully.
const API_V = "v22.0";

export function waConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const elder = process.env.ELDER_WHATSAPP_NUMBER; // e.g. 251911234567 (no +)
  if (!token || !phoneId) return { ok: false as const, error: "whatsapp disabled (set WHATSAPP_TOKEN/PHONE_NUMBER_ID)" };
  return { ok: true as const, token, phoneId, elder };
}

async function waPost(phoneId: string, token: string, payload: unknown) {
  const res = await fetch(`https://graph.facebook.com/${API_V}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: `whatsapp ${res.status}: ${JSON.stringify(data).slice(0, 200)}` };
  return { ok: true as const, data };
}

export async function sendWaText(to: string, text: string) {
  const cfg = waConfig();
  if (!cfg.ok) return cfg;
  return waPost(cfg.phoneId, cfg.token, { messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } });
}

// Audio message via PUBLIC link (our /api/speak GET). WhatsApp fetches the MP3.
export async function sendWaVoice(to: string, audioUrl: string) {
  const cfg = waConfig();
  if (!cfg.ok) return cfg;
  return waPost(cfg.phoneId, cfg.token, { messaging_product: "whatsapp", to, type: "audio", audio: { link: audioUrl } });
}

// Download inbound voice note bytes via media ID (for Scribe transcription).
export async function downloadWaMedia(mediaId: string): Promise<{ ok: true; bytes: Uint8Array; mime: string } | { ok: false; error: string }> {
  const cfg = waConfig();
  if (!cfg.ok) return cfg;
  const meta = await fetch(`https://graph.facebook.com/${API_V}/${mediaId}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  }).then((r) => r.json().catch(() => ({})));
  const url = (meta as { url?: string }).url;
  if (!url) return { ok: false, error: "media url lookup failed" };
  const file = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!file.ok) return { ok: false, error: `media download ${file.status}` };
  return { ok: true, bytes: new Uint8Array(await file.arrayBuffer()), mime: file.headers.get("content-type") ?? "audio/ogg" };
}

// ElevenLabs Scribe: speech-to-text (reuses your credits, no new vendor).
export async function transcribeVoice(bytes: Uint8Array, mime: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, error: "no ELEVENLABS_API_KEY for transcription" };
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: mime }), "voice-note.ogg");
  form.append("model_id", "scribe_v1");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `scribe ${res.status}` };
  const text = String((data as { text?: string }).text ?? "").trim();
  if (!text) return { ok: false, error: "empty transcript" };
  return { ok: true, text };
}
