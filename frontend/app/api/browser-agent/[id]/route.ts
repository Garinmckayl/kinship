import { NextResponse } from "next/server";
import { getBrowserTask } from "@/lib/browser-agent";
import { deleteBrowserTask } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const task = await getBrowserTask(params.id);
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "task not found or sidecar unavailable" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteBrowserTask(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[browser-agent/delete]", e);
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
