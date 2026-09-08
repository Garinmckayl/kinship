import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const u = await getSession();
  if (!u) {
    const res = NextResponse.json({ user: null }, { status: 401 });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  }
  const res = NextResponse.json({ user: u });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
