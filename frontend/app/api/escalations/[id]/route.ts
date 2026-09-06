import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { ackEscalation } from "@/lib/store";

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCaregiver();
    await ackEscalation(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
