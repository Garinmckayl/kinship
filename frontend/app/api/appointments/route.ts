import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { listAppointments, addAppointment } from "@/lib/store";

export async function GET() {
  try {
    await requireCaregiver();
    return NextResponse.json({ appointments: await listAppointments("eleanor-79") });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireCaregiver();
    const body = await req.json().catch(() => ({}));
    if (!body.title || !body.at) return NextResponse.json({ error: "title and at (ISO) required" }, { status: 400 });
    const appt = await addAppointment("eleanor-79", {
      title: String(body.title), doctor: String(body.doctor ?? ""), location: String(body.location ?? ""),
      at: String(body.at), notes: String(body.notes ?? ""),
    });
    try {
      const { gcalOn, gcalCreate } = await import("@/lib/gcal");
      if (gcalOn()) {
        const end = new Date(new Date(appt.at).getTime() + 3600_000).toISOString();
        const g = await gcalCreate({ title: appt.title, description: appt.notes, startISO: new Date(appt.at).toISOString(), endISO: end, location: appt.location });
        if (g.ok) {
          const { q } = await import("@/lib/db");
          await q("update appointments set google_event_id=$1 where id=$2", [(g as { eventId?: string }).eventId ?? "", appt.id]);
        }
      }
    } catch {}
    return NextResponse.json({ appointment: appt });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
