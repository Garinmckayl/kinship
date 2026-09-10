import { NextResponse } from "next/server";
import { listBrowserTasks as listFromDB, saveBrowserTask, updateBrowserTask } from "@/lib/store";
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

    const merged: Record<string, unknown>[] = dbTasks.map((dt) => {
      // Check if any sidecar task matches (by scanning for same task_type created around same time)
      // For direct matches (sidecar_task_id stored in DB), we'd check that
      return {
        task_id: dt.id, task_type: dt.task_type, status: dt.status,
        params: dt.params, steps: dt.steps ?? [], result: dt.result, error: dt.error,
        started_at: dt.created_at, completed_at: dt.completed_at, recording_url: null,
      };
    });

    // Add sidecar-only tasks and override status for matching DB ones
    for (const st of sidecarTasks) {
      const existing = merged.find((m) =>
        m.task_type === st.task_type && (
          m.status === "approved" || m.status === "running" ||
          m.status === "completed" || m.status === "failed"
        )
      );
      if (existing) {
        // Sidecar has the real status -- override
        existing.status = String(st.status ?? existing.status);
        existing.steps = (st.steps as unknown[]) ?? existing.steps;
        existing.result = (st.result as Record<string, unknown>) ?? existing.result;
        existing.error = (st.error as string) ?? existing.error;
        if (st.recording_url) existing.recording_url = String(st.recording_url);
        // Sync completed status back to DB
        if (st.status === "completed" || st.status === "failed") {
          updateBrowserTask(String(existing.task_id), {
            status: String(st.status),
            steps: (st.steps as Record<string, unknown>[]) ?? [],
            result: (st.result as Record<string, unknown>) ?? undefined,
            error: st.error != null ? String(st.error) : undefined,
          }).catch(() => {});
        }
      } else if (!merged.find((m) => m.task_id === String(st.task_id))) {
        merged.unshift({
          task_id: String(st.task_id), task_type: String(st.task_type), status: String(st.status),
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
