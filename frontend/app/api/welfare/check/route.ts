import { NextResponse } from "next/server";
import { welfareSweep } from "@/lib/welfare";

// Manual welfare trigger (demo/testing): REPORT_SECRET. Production rhythm is the Inngest cron.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!process.env.REPORT_SECRET || body.secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(await welfareSweep("eleanor-79"));
}
