import { NextResponse } from "next/server";
import { verifyElevenToolRequest } from "@/lib/eleven";
import { parentSnapshot } from "@/lib/caregiver";

export async function POST(req: Request) {
  if (!verifyElevenToolRequest(req)) return NextResponse.json({ error: "invalid ElevenLabs tool credentials" }, { status: 401 });
  const snapshot = JSON.parse(await parentSnapshot());
  return NextResponse.json({ ok: true, snapshot });
}
