import { sign } from "crypto";

// Google Calendar via service account (no OAuth UX).
// Needs: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY (\n-escaped ok), GOOGLE_CALENDAR_ID.
// Share the target calendar with the service-account email (Make changes to events).
export function gcalOn() {
  return !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_CALENDAR_ID);
}

async function accessToken(): Promise<string> {
  const email = process.env.GOOGLE_CLIENT_EMAIL!;
  const key = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "RS256", typ: "JWT" });
  const claim = b64({
    iss: email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const sig = sign("RSA-SHA256", Buffer.from(`${header}.${claim}`), key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${sig}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`google auth ${res.status}`);
  return (data as { access_token: string }).access_token;
}

export async function gcalCreate(a: { title: string; description: string; startISO: string; endISO: string; location: string }) {
  if (!gcalOn()) return { ok: false as const, error: "google calendar not configured" };
  const token = await accessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: a.title,
        description: a.description,
        location: a.location,
        start: { dateTime: a.startISO },
        end: { dateTime: a.endISO },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: `gcal ${res.status}` };
  const d = data as { id?: string; htmlLink?: string };
  return { ok: true as const, eventId: d.id, link: d.htmlLink };
}
