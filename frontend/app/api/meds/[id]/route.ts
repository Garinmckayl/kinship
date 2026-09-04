import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { updateMed, deleteMed } from "@/lib/store";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCaregiver();
    const body = await req.json().catch(() => ({}));
    const med = await updateMed(params.id, {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.dosage !== undefined ? { dosage: String(body.dosage) } : {}),
      ...(body.time !== undefined ? { time: String(body.time) } : {}),
      ...(body.label !== undefined ? { label: String(body.label) } : {}),
      ...(body.active !== undefined ? { active: !!body.active } : {}),
    });
    if (!med) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ med });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCaregiver();
    await deleteMed(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
