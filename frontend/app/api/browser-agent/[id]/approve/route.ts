import { NextResponse } from "next/server";
import { addEscalation, saveBrowserTask, updateBrowserTask } from "@/lib/store";

// Approve and execute a browser task.
// Priority: 1) Sidecar via NOVA_SIDECAR_URL  2) Inngest -> AgentCore  3) Direct AgentCore
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
    const taskType = body.task_type as string | undefined;
    const taskParams = (body.params ?? {}) as Record<string, unknown>;

    if (!taskType) {
      return NextResponse.json({ error: "task_type required" }, { status: 400 });
    }

    const taskId = params.id;
    await saveBrowserTask(taskId, taskType, taskParams, "approved");

    // --- Path 1: Sidecar (via Cloudflare tunnel or local) ---
    const SIDECAR_URL = process.env.NOVA_SIDECAR_URL || "http://98.92.77.193:8100";
    const SIDECAR_SECRET = process.env.NOVA_SIDECAR_SECRET ?? "elderlove-nova-dev";

    if (SIDECAR_URL) {
      try {
        // Create task on sidecar
        const createRes = await fetch(`${SIDECAR_URL}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SIDECAR_SECRET}` },
          body: JSON.stringify({ task_type: taskType, params: taskParams, approved: true }),
          signal: AbortSignal.timeout(8000),
        });

        if (createRes.ok) {
          const sidecarTask = await createRes.json();
          await addEscalation("eleanor-79", "info", `Browser task approved and executing via Nova Act sidecar: ${taskType}`);
          await updateBrowserTask(taskId, { status: "running" });

          return NextResponse.json({
            task_id: taskId,
            task_type: taskType,
            status: "running",
            params: taskParams,
            steps: [],
            result: null,
            error: null,
            sidecar_task_id: sidecarTask.task_id,
            mode: "sidecar",
          });
        }
      } catch (sidecarErr) {
        console.warn("[approve] Sidecar unavailable:", String(sidecarErr).slice(0, 200));
      }
    }

    // --- Path 2: Inngest (durable, handles AgentCore timeout) ---
    try {
      const { inngest } = await import("@/lib/inngest");
      await inngest.send({
        name: "elder/browser-task.approved",
        data: { taskId, taskType, params: taskParams },
      });
      await addEscalation("eleanor-79", "info", `Browser task approved: ${taskType}. Executing via Inngest + AgentCore...`);
      return NextResponse.json({
        task_id: taskId, task_type: taskType, status: "approved",
        params: taskParams, steps: [], result: null, error: null, mode: "inngest",
      });
    } catch (inngestErr) {
      console.warn("[approve] Inngest unavailable:", String(inngestErr).slice(0, 200));
    }

    // --- Path 3: Neither available ---
    await addEscalation("eleanor-79", "attention",
      `Browser task approved but no execution backend available: ${taskType}. Caregiver should complete manually.`);
    await updateBrowserTask(taskId, { status: "failed", error: "No execution backend (sidecar or Inngest) available" });

    return NextResponse.json({
      task_id: taskId, task_type: taskType, status: "failed",
      error: "No execution backend available. Set NOVA_SIDECAR_URL or configure Inngest.",
    });
  } catch (e) {
    const msg = String(e).slice(0, 500);
    console.error("[browser-agent/approve] Error:", msg);
    return NextResponse.json({
      task_id: params.id, task_type: body?.task_type ?? "unknown",
      status: "failed", error: msg,
    });
  }
}
