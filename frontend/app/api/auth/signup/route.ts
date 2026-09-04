import { NextResponse } from "next/server";
import { createUser, mintSession, sessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const u = await createUser(String(body.name ?? ""), String(body.email ?? ""), String(body.password ?? ""), "caregiver");
    const res = NextResponse.json({ ok: true, user: u });
    res.headers.set("Set-Cookie", sessionCookie(mintSession(u)));
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "signup failed" }, { status: 400 });
  }
}
