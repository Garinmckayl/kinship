import { NextResponse } from "next/server";
import { approveBrowserTask } from "@/lib/browser-agent";
import { addEscalation } from "@/lib/store";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const task = await approveBrowserTask(params.id);
    await addEscalation("eleanor-79", "info", `Browser task approved and running: ${task.task_type} (${task.task_id})`);
    return NextResponse.json(task);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
