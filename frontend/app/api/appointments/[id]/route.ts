import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { getAppointment, setAppointment, deleteAppointment } from "@/lib/store";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCaregiver();
    const body = await req.json().catch(() => ({}));
    const current = await getAppointment(params.id);
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (body.status === "upcoming" && current.status === "proposed") {
      return NextResponse.json({ error: "approval required; use POST /api/appointments/[id]/approve" }, { status: 409 });
    }
    const appt = await setAppointment(params.id, {
      ...(body.status !== undefined ? { status: String(body.status) } : {}),
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.at !== undefined ? { at: String(body.at) } : {}),
      ...(body.notes !== undefined ? { notes: String(body.notes) } : {}),
    });
    if (!appt) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ appointment: appt });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCaregiver();
    await deleteAppointment(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
