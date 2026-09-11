import { NextResponse } from "next/server";
import { listBrowserTasks as listFromDB, saveBrowserTask, updateBrowserTask, getDismissedBrowserTasks } from "@/lib/store";
import { type BrowserTaskType } from "@/lib/browser-agent";

const SIDECAR_URL = process.env.NOVA_SIDECAR_URL;
const SIDECAR_SECRET = process.env.NOVA_SIDECAR_SECRET ?? "elderlove-nova-dev";

async function fetchSidecar(path: string): Promise<Response | null> {
  if (!SIDECAR_URL) return null;
  try {
    return await fetch(`${SIDECAR_URL}${path}`, {
      headers: { Authorization: `Bearer ${SIDECAR_SECRET}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch { return null; }
}

// GET: list browser tasks -- sidecar is source of truth for running tasks
export async function GET() {
  try {
    const dbTasks = await listFromDB("eleanor-79");
    const dismissedIds = await getDismissedBrowserTasks();

    // Fetch sidecar tasks
    const sidecarRes = await fetchSidecar("/tasks");
    let sidecarTasks: Record<string, unknown>[] = [];
    if (sidecarRes?.ok) {
      sidecarTasks = await sidecarRes.json();
    }

    // Build merged list: sidecar data wins for matching tasks
    const sidecarMap = new Map<string, Record<string, unknown>>();
    for (const st of sidecarTasks) {
      // Sidecar tasks have their own IDs -- match by looking at recent ones
      sidecarMap.set(String(st.task_id), st);
    }

    const linkedSidecarIds = new Set(dbTasks.map((task) => task.sidecar_task_id).filter(Boolean));
    const merged: Record<string, unknown>[] = dbTasks
      .filter((dt) => !dismissedIds.includes(dt.id) && (!dt.sidecar_task_id || !dismissedIds.includes(dt.sidecar_task_id)))
      .map((dt) => {
        const sidecarTask = dt.sidecar_task_id ? sidecarMap.get(dt.sidecar_task_id) : undefined;
        const task: Record<string, unknown> = {
          task_id: dt.id, task_type: dt.task_type, status: String(sidecarTask?.status ?? dt.status),
          sidecar_task_id: dt.sidecar_task_id,
          params: dt.params,
          steps: (sidecarTask?.steps as Record<string, unknown>[]) ?? dt.steps ?? [],
          result: (sidecarTask?.result as Record<string, unknown>) ?? dt.result,
          error: sidecarTask?.error != null ? String(sidecarTask.error) : dt.error,
          started_at: String(sidecarTask?.started_at ?? dt.created_at),
          completed_at: sidecarTask?.completed_at ? String(sidecarTask.completed_at) : dt.completed_at,
          recording_url: sidecarTask?.recording_url ? String(sidecarTask.recording_url) : null,
        };
        if (!sidecarTask) return task;

        if (sidecarTask.status === "completed" || sidecarTask.status === "failed") {
          updateBrowserTask(dt.id, {
            status: String(sidecarTask.status),
            steps: (sidecarTask.steps as Record<string, unknown>[]) ?? [],
            result: (sidecarTask.result as Record<string, unknown>) ?? undefined,
            error: sidecarTask.error != null ? String(sidecarTask.error) : undefined,
          }).catch((error) => console.error("[browser-agent] Failed to sync task:", error));
        }
        return task;
      });

    // Include tasks created directly on the sidecar, but never guess associations by task type.
    for (const st of sidecarTasks) {
      const taskId = String(st.task_id);
      if (dismissedIds.includes(taskId) || linkedSidecarIds.has(taskId)) continue;
      if (!merged.find((m) => m.task_id === taskId)) {
        merged.unshift({
          task_id: taskId, task_type: String(st.task_type), status: String(st.status),
          params: (st.params as Record<string, unknown>) ?? {},
          steps: (st.steps as unknown[]) ?? [],
          result: (st.result as Record<string, unknown>) ?? null,
          error: (st.error as string) ?? null,
          started_at: (st.started_at as string) ?? null,
          completed_at: (st.completed_at as string) ?? null,
          recording_url: (st.recording_url as string) ?? null,
        });
      }
    }

    return NextResponse.json({ tasks: merged, sidecar: sidecarTasks.length > 0 });
  } catch {
    return NextResponse.json({ tasks: [], sidecar: false });
  }
}

// POST: create a new browser task
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { task_type, params } = body as { task_type?: BrowserTaskType; params?: Record<string, unknown> };
  if (!task_type) return NextResponse.json({ error: "task_type required" }, { status: 400 });

  const taskId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const task = await saveBrowserTask(taskId, task_type, params ?? {}, "pending_approval");
  return NextResponse.json({
    task_id: task.id, task_type: task.task_type, status: task.status,
    params: task.params, steps: [], result: null, error: null,
  });
}
