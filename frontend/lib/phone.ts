// Real phone calls via Twilio (PSTN — Eleanor's actual phone rings).
// Zero new deps: raw REST + TwiML. Without creds every entrypoint degrades
// gracefully (503 / honest tool message) instead of crashing the demo.
export function phoneConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const elder = process.env.ELDER_PHONE_NUMBER;
  if (!sid || !token || !from) return { ok: false as const, error: "phone disabled (set TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER)" };
  return { ok: true as const, sid, token, from, elder };
}

export function publicBase(req?: Request) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (host) return `https://${host}`;
  }
  return "";
}

export function escXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 900);
}

export async function placeCall(to: string, twimlUrl: string) {
  const cfg = phoneConfig();
  if (!cfg.ok) return cfg;
  const auth = Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64");
  const body = new URLSearchParams({ To: to, From: cfg.from, Url: twimlUrl });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: `twilio ${res.status}: ${(data as { message?: string }).message ?? "call failed"}` };
  return { ok: true as const, sid: (data as { sid?: string }).sid };
}
