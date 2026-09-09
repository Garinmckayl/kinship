import { NextResponse } from "next/server";
import { addEscalation, saveBrowserTask, updateBrowserTask } from "@/lib/store";

// Approve a browser task: saves to DB and fires Inngest event for durable execution.
// Returns immediately (within Vercel's 10s timeout). Inngest handles the long-running AgentCore call.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const taskType = body.task_type as string | undefined;
    const taskParams = (body.params ?? {}) as Record<string, unknown>;

    if (!taskType) {
      return NextResponse.json({ error: "task_type required" }, { status: 400 });
    }

    const taskId = params.id;

    // Save task to DB
    await saveBrowserTask(taskId, taskType, taskParams, "approved");
    await addEscalation("eleanor-79", "info", `Browser task approved: ${taskType}. Executing via AgentCore...`);

    // Fire Inngest event for durable background execution
    try {
      const { inngest } = await import("@/lib/inngest");
      await inngest.send({
        name: "elder/browser-task.approved",
        data: { taskId, taskType, params: taskParams },
      });
    } catch (inngestErr) {
      // Inngest not available — try direct invocation (will likely timeout on Vercel Hobby)
      console.warn("Inngest unavailable, falling back to direct invocation:", inngestErr);

      const RUNTIME_ARN = process.env.NOVA_AGENTCORE_RUNTIME;
      if (!RUNTIME_ARN) {
        await updateBrowserTask(taskId, { status: "failed", error: "Neither Inngest nor NOVA_AGENTCORE_RUNTIME configured" });
        return NextResponse.json({
          task_id: taskId, task_type: taskType, status: "failed",
          error: "Browser automation not configured. Set NOVA_AGENTCORE_RUNTIME and Inngest keys.",
        });
      }

      // Best-effort direct call (may timeout on Hobby plan)
      try {
        const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = await import("@aws-sdk/client-bedrock-agentcore");
        const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? "us-east-1" });
        const command = new InvokeAgentRuntimeCommand({
          agentRuntimeArn: RUNTIME_ARN,
          contentType: "application/json",
          accept: "application/json",
          payload: new TextEncoder().encode(JSON.stringify({ task_type: taskType, params: taskParams })),
        });
        await updateBrowserTask(taskId, { status: "running" });
        const response = await client.send(command);
        let responseBody = "{}";
        if (response.response) {
          const chunks: Uint8Array[] = [];
          for await (const chunk of response.response as AsyncIterable<Uint8Array>) { chunks.push(chunk); }
          const merged = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
          let offset = 0;
          for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
          responseBody = new TextDecoder().decode(merged);
        }
        const parsed = JSON.parse(responseBody);
        await updateBrowserTask(taskId, {
          status: parsed.status === "success" ? "completed" : "failed",
          result: parsed.result ?? null,
          error: parsed.status === "error" ? parsed.response : null,
        });
      } catch (e) {
        await updateBrowserTask(taskId, { status: "failed", error: `AgentCore invocation failed: ${String(e).slice(0, 300)}` });
      }
    }

    // Return immediately with "approved" status
    return NextResponse.json({
      task_id: taskId,
      task_type: taskType,
      status: "approved",
      params: taskParams,
      steps: [],
      result: null,
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 500) }, { status: 500 });
  }
}
