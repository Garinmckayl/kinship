import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { addEscalation, claimBrowserTaskApproval, updateBrowserTask } from "@/lib/store";
import { normalizeBrowserTaskParams } from "@/lib/browser-task";

// Approve and execute a browser task.
// Priority: 1) Sidecar via NOVA_SIDECAR_URL  2) Inngest -> AgentCore  3) Direct AgentCore
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCaregiver();
  } catch (error) {
    return error as Response;
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
    const taskType = body.task_type as string | undefined;
    const taskParams = normalizeBrowserTaskParams(taskType ?? "", (body.params ?? {}) as Record<string, unknown>);

    if (!taskType) {
      return NextResponse.json({ error: "task_type required" }, { status: 400 });
    }

    const taskId = params.id;
    const approval = await claimBrowserTaskApproval(taskId, taskType, taskParams);
    if (!approval.claimed) {
      return NextResponse.json({
        task_id: approval.task.id,
        task_type: approval.task.task_type,
        status: approval.task.status,
        params: approval.task.params,
        steps: approval.task.steps,
        result: approval.task.result,
        error: approval.task.error,
        sidecar_task_id: approval.task.sidecar_task_id,
        mode: approval.task.sidecar_task_id ? "sidecar" : "existing",
      });
    }

    // --- Path 1: Sidecar (via Cloudflare tunnel or local) ---
    const SIDECAR_URL = process.env.NOVA_SIDECAR_URL;
    const SIDECAR_SECRET = process.env.NOVA_SIDECAR_SECRET ?? "elderlove-nova-dev";

    if (SIDECAR_URL) {
      try {
        const createRes = await fetch(`${SIDECAR_URL}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SIDECAR_SECRET}` },
          body: JSON.stringify({ task_id: taskId, task_type: taskType, elder_id: "eleanor-79", params: taskParams, approved: true }),
          signal: AbortSignal.timeout(8000),
        });

        if (!createRes.ok) {
          const detail = (await createRes.text()).slice(0, 200);
          throw new Error(`Sidecar rejected task (${createRes.status}): ${detail}`);
        }
        const sidecarTask = await createRes.json();
        const sidecarTaskId = String(sidecarTask.task_id ?? "");
        if (!sidecarTaskId) throw new Error("Sidecar created a task without a task_id");

        const sidecarStatus = String(sidecarTask.status ?? "running");
        const taskPatch = {
          status: sidecarStatus,
          sidecar_task_id: sidecarTaskId,
          steps: (sidecarTask.steps as Record<string, unknown>[]) ?? [],
          result: (sidecarTask.result as Record<string, unknown>) ?? undefined,
          error: sidecarTask.error != null ? String(sidecarTask.error) : undefined,
        };
        await updateBrowserTask(taskId, taskPatch).catch((error) => {
          console.error("[approve] Nova Act launched but task sync failed:", String(error).slice(0, 300));
        });
        await addEscalation("eleanor-79", "info", `Browser task approved and executing via Nova Act sidecar: ${taskType}`).catch((error) => {
          console.error("[approve] Nova Act launched but escalation sync failed:", String(error).slice(0, 300));
        });

        return NextResponse.json({
          task_id: taskId,
          task_type: taskType,
          status: sidecarStatus,
          params: taskParams,
          steps: taskPatch.steps,
          result: taskPatch.result ?? null,
          error: taskPatch.error ?? null,
          sidecar_task_id: sidecarTaskId,
          recording_url: sidecarTask.recording_url ?? null,
          mode: "sidecar",
        });
      } catch (sidecarErr) {
        const message = `Nova Act could not start: ${String(sidecarErr).slice(0, 300)}`;
        console.error("[approve]", message);
        await updateBrowserTask(taskId, { status: "failed", error: message }).catch((error) => {
          console.error("[approve] Failed to persist launch error:", String(error).slice(0, 200));
        });
        return NextResponse.json({
          task_id: taskId,
          task_type: taskType,
          status: "failed",
          params: taskParams,
          steps: [],
          result: null,
          error: message,
          mode: "sidecar",
        }, { status: 502 });
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
    await updateBrowserTask(params.id, { status: "failed", error: msg }).catch((updateError) => {
      console.error("[browser-agent/approve] Failed to persist error:", String(updateError).slice(0, 200));
    });
    return NextResponse.json({
      task_id: params.id, task_type: body?.task_type ?? "unknown",
      status: "failed", error: msg,
    }, { status: 500 });
  }
}
