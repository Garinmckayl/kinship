import { NextResponse } from "next/server";
import { verifyUser, mintSession, sessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const u = await verifyUser(String(body.email ?? ""), String(body.password ?? ""));
    const res = NextResponse.json({ ok: true, user: u });
    res.headers.set("Set-Cookie", sessionCookie(mintSession(u)));
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "login failed";
    const status = msg.includes("database not configured") ? 503 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}
