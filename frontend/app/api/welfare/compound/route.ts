import { NextResponse } from "next/server";
import { assessCompoundRisk } from "@/lib/compound-risk";

// Compound-risk assessment endpoint.
// GET: read-only assessment (dashboard polls this -- NO escalation)
export async function GET() {
  const result = await assessCompoundRisk("eleanor-79", { escalate: false });
  return NextResponse.json(result);
}

// POST: protected trigger with escalation (Inngest cron or manual)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!process.env.REPORT_SECRET || body.secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await assessCompoundRisk("eleanor-79", { escalate: true });
  return NextResponse.json(result);
}
