import { NextResponse } from "next/server";
import { assessCompoundRisk } from "@/lib/compound-risk";

// Compound-risk assessment endpoint.
// GET: public read (family dashboard polls this).
// POST: protected trigger (Inngest cron or manual with REPORT_SECRET).
export async function GET() {
  const result = await assessCompoundRisk("eleanor-79");
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!process.env.REPORT_SECRET || body.secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await assessCompoundRisk("eleanor-79");
  return NextResponse.json(result);
}
