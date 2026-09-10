import { NextResponse } from "next/server";
import { q, dbOn, ready } from "@/lib/db";

// POST: acknowledge all alerts at once
export async function POST() {
  if (!dbOn()) return NextResponse.json({ ok: true, cleared: 0 });
  await ready();
  const result = await q("update escalations set acked=true where acked=false and elder_id='eleanor-79'", []);
  return NextResponse.json({ ok: true });
}
