import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const u = await getSession();
  if (!u) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: u });
}
