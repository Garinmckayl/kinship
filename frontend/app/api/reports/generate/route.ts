import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendDailyReport } from "@/lib/notify";

// Manual trigger: caregiver session OR REPORT_SECRET. Used for demo/testing;
// production rhythm comes from the Inngest daily-report cron.
export async function POST(req: Request) {
  const u = await getSession();
  const body = await req.json().catch(() => ({}));
  const secretOk = process.env.REPORT_SECRET && body.secret === process.env.REPORT_SECRET;
  if (!u && !secretOk) return NextResponse.json({ error: "login or secret required" }, { status: 403 });
  const out = await sendDailyReport("ruth-78");
  return NextResponse.json({ ok: true, channels: out.channels, summary: out.summary });
}
