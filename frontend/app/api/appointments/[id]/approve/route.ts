import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { addEscalation, getAppointment, setAppointment } from "@/lib/store";
import { syncAppointmentToGoogle } from "@/lib/appointment-sync";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCaregiver();
    const current = await getAppointment(params.id);
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (current.status !== "proposed") return NextResponse.json({ error: "only proposed appointments can be approved", appointment: current }, { status: 409 });
    const appointment = await setAppointment(params.id, { status: "upcoming" });
    if (!appointment) return NextResponse.json({ error: "not found" }, { status: 404 });
    const sync = await syncAppointmentToGoogle(appointment);
    await addEscalation("eleanor-79", "info", "Caregiver approved appointment: " + appointment.title + " on " + new Date(appointment.at).toLocaleString() + ".");
    return NextResponse.json({ ok: true, appointment, calendar: sync.ok ? "synced" : "saved locally" });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
