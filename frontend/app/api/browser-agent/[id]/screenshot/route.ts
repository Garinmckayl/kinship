import { NextResponse } from "next/server";
import { getLatestScreenshot } from "@/lib/browser-agent";

// GET: poll for the latest screenshot of a running browser task
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const data = await getLatestScreenshot(params.id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ screenshot: null, status: "unknown" }, { status: 404 });
  }
}
