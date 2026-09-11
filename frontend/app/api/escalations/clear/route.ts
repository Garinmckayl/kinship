import { NextResponse } from "next/server";
import { q, dbOn, ready } from "@/lib/db";

// POST: permanently remove all alerts from the caregiver dashboard.
export async function POST() {
  if (!dbOn()) return NextResponse.json({ ok: true, cleared: 0 });
  await ready();
  const result = await q<{ id: number }>(
    "delete from escalations where elder_id='eleanor-79' returning id",
    [],
  );
  return NextResponse.json({ ok: true, cleared: result.length });
}
