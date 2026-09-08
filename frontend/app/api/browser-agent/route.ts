import { NextResponse } from "next/server";
import { createBrowserTask, listBrowserTasks, sidecarHealthy, type BrowserTaskType } from "@/lib/browser-agent";

// GET: list all browser tasks (family dashboard polls this)
export async function GET() {
  try {
    const tasks = await listBrowserTasks();
    return NextResponse.json({ tasks, sidecar: true });
  } catch {
    return NextResponse.json({ tasks: [], sidecar: false });
  }
}

// POST: create a new browser task (guardian agent or caregiver)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { task_type, params, approved } = body as {
    task_type?: BrowserTaskType;
    params?: Record<string, unknown>;
    approved?: boolean;
  };

  if (!task_type) {
    return NextResponse.json({ error: "task_type required" }, { status: 400 });
  }

  const healthy = await sidecarHealthy();
  if (!healthy) {
    return NextResponse.json({
      error: "Nova Act sidecar is not running. Start it with: cd nova-act && python server.py",
      sidecar: false,
    }, { status: 503 });
  }

  try {
    const task = await createBrowserTask(task_type, params ?? {}, approved ?? false);
    return NextResponse.json(task);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
