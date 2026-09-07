import { NextResponse } from "next/server";
import { interceptScam } from "@/lib/demo-lab";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  return NextResponse.json(await interceptScam(transcript, { live: body.live === true }));
}

