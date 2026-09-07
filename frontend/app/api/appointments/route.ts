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
    }, "proposed");
    return NextResponse.json({ appointment: appt, needsApproval: true });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
