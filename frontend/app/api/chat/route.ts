import { NextResponse } from "next/server";
import { chat } from "@/lib/guardian";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = body.user_id ?? body.userId ?? "ruth-78";
  const message = body.message ?? "";
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
  const out = await chat(userId, message);
  return NextResponse.json(out);
}
