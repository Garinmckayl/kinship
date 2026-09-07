import { NextResponse } from "next/server";
import { auditPillTray } from "@/lib/demo-lab";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const image = typeof body.image === "string" ? body.image : undefined;
  return NextResponse.json(await auditPillTray(image));
}

