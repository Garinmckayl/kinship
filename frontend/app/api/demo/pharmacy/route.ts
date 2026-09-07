import { NextResponse } from "next/server";
import { runPharmacyRefill } from "@/lib/demo-lab";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await runPharmacyRefill({
    medication: typeof body.medication === "string" ? body.medication : undefined,
    live: body.live === true,
  });
  return NextResponse.json(result);
}

