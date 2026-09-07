import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listHealth, logHealth, healthTrends } from "@/lib/store";

// GET ?trends=1 -> latest + 7d averages; else recent readings.
export async function GET(req: Request) {
  const u = await getSession();
  if (!u) return NextResponse.json({ error: "login required" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("trends")) return NextResponse.json(await healthTrends("eleanor-79"));
  return NextResponse.json({ metrics: await listHealth("eleanor-79", url.searchParams.get("type") ?? undefined, 30) });
}

// POST: caregiver session (manual log) OR REPORT_SECRET (watch/ingest key).
export async function POST(req: Request) {
  const u = await getSession();
  const body = await req.json().catch(() => ({}));
  const secretOk = process.env.REPORT_SECRET && body.secret === process.env.REPORT_SECRET;
  if (!u && !secretOk) return NextResponse.json({ error: "login or secret required" }, { status: 403 });
  const { type, value, unit, source } = body;
  if (!type || typeof value !== "number") return NextResponse.json({ error: "type and numeric value required" }, { status: 400 });
  const m = await logHealth("eleanor-79", String(type), value, String(unit ?? ""), u ? "manual" : String(source ?? "watch"));
  return NextResponse.json({ metric: m });
}
