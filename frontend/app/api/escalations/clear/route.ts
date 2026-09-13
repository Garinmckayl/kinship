import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { q, dbOn, ready } from "@/lib/db";

// POST: permanently remove all alerts from the caregiver dashboard.
export async function POST() {
  try {
    await requireCaregiver();
  } catch (error) {
    return error as Response;
  }
  if (!dbOn()) return NextResponse.json({ ok: true, cleared: 0 });
  await ready();
  const result = await q<{ id: number }>(
    "delete from escalations where elder_id='eleanor-79' returning id",
    [],
  );
  return NextResponse.json({ ok: true, cleared: result.length });
}
