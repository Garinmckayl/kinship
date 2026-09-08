import { NextResponse } from "next/server";
import { getBrowserTask } from "@/lib/browser-agent";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const task = await getBrowserTask(params.id);
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "task not found or sidecar unavailable" }, { status: 404 });
  }
}
