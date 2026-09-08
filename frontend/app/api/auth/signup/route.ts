import { NextResponse } from "next/server";
import { createUser, mintSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const u = await createUser(String(body.name ?? ""), String(body.email ?? ""), String(body.password ?? ""), "caregiver");
    const res = NextResponse.json({ ok: true, user: u });
    return setSessionCookie(res, mintSession(u));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "signup failed";
    const status = msg.includes("database not configured") ? 503 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
