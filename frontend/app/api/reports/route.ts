import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listReports } from "@/lib/store";

export async function GET() {
  const u = await getSession();
  if (!u) return NextResponse.json({ error: "login required" }, { status: 401 });
  return NextResponse.json({ reports: await listReports("eleanor-79") });
}
