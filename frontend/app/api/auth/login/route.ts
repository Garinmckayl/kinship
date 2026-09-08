import { NextResponse } from "next/server";
import { verifyUser, mintSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const u = await verifyUser(String(body.email ?? ""), String(body.password ?? ""));
    const res = NextResponse.json({ ok: true, user: u });
    return setSessionCookie(res, mintSession(u));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "login failed";
    const status = msg.includes("database not configured") ? 503 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}
