import { NextResponse } from "next/server";
import { listBrowserTasks as listFromDB, saveBrowserTask } from "@/lib/store";
import { listBrowserTasks as listFromSidecar, sidecarHealthy, type BrowserTaskType } from "@/lib/browser-agent";

// GET: list all browser tasks (from DB + sidecar if available)
export async function GET() {
  try {
    // Primary: read from database (works on Vercel)
    const dbTasks = await listFromDB("eleanor-79");

    // Secondary: merge sidecar tasks if available
    let sidecar = false;
    if (await sidecarHealthy()) {
      try {
        const sidecarTasks = await listFromSidecar();
        sidecar = true;
        // Merge sidecar tasks not already in DB
        for (const st of sidecarTasks) {
          if (!dbTasks.find((dt) => dt.id === st.task_id)) {
            dbTasks.push({
              id: st.task_id, task_type: st.task_type, status: st.status,
              params: st.params, steps: st.steps, result: st.result as Record<string, unknown> | null,
              error: st.error, created_at: st.started_at ?? new Date().toISOString(), completed_at: st.completed_at,
            });
          }
        }
      } catch {}
    }

    return NextResponse.json({
      tasks: dbTasks.map((t) => ({
        task_id: t.id, task_type: t.task_type, status: t.status,
        params: t.params, steps: t.steps, result: t.result, error: t.error,
        started_at: t.created_at, completed_at: t.completed_at,
      })),
      sidecar,
    });
  } catch {
    return NextResponse.json({ tasks: [], sidecar: false });
  }
}

// POST: create a new browser task
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { task_type, params } = body as { task_type?: BrowserTaskType; params?: Record<string, unknown> };

  if (!task_type) {
    return NextResponse.json({ error: "task_type required" }, { status: 400 });
  }

  const taskId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const task = await saveBrowserTask(taskId, task_type, params ?? {}, "pending_approval");

  return NextResponse.json({
    task_id: task.id, task_type: task.task_type, status: task.status,
    params: task.params, steps: [], result: null, error: null,
  });
}
