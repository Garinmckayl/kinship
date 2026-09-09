import { NextResponse } from "next/server";
import { addEscalation } from "@/lib/store";

// Approve and execute a browser task directly via AgentCore.
// On Vercel (serverless), we can't persist in-memory task state across invocations.
// Instead, the approve button sends the task_type and params directly, and we invoke AgentCore here.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const taskType = body.task_type;
    const taskParams = body.params ?? {};

    if (!taskType) {
      // Try the bridge's approveBrowserTask (works when sidecar is running)
      const { approveBrowserTask } = await import("@/lib/browser-agent");
      const task = await approveBrowserTask(params.id);
      await addEscalation("eleanor-79", "info", `Browser task approved: ${task.task_type} (${task.task_id})`);
      return NextResponse.json(task);
    }

    // Direct AgentCore invocation
    const RUNTIME_ARN = process.env.NOVA_AGENTCORE_RUNTIME;
    if (!RUNTIME_ARN) {
      return NextResponse.json({ error: "NOVA_AGENTCORE_RUNTIME not configured" }, { status: 503 });
    }

    await addEscalation("eleanor-79", "info", `Browser task approved and executing via AgentCore: ${taskType}`);

    const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = await import("@aws-sdk/client-bedrock-agentcore");
    const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? "us-east-1" });

    const payload = JSON.stringify({ task_type: taskType, params: taskParams });
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: RUNTIME_ARN,
      contentType: "application/json",
      accept: "application/json",
      payload: new TextEncoder().encode(payload),
    });

    const response = await client.send(command);

    let responseBody = "{}";
    if (response.response) {
      if (response.response instanceof Uint8Array) {
        responseBody = new TextDecoder().decode(response.response);
      } else if (typeof response.response === "string") {
        responseBody = response.response;
      } else {
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.response as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const total = chunks.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        responseBody = new TextDecoder().decode(merged);
      }
    }

    const parsed = JSON.parse(responseBody);
    await addEscalation("eleanor-79",
      parsed.status === "success" ? "info" : "attention",
      `Browser task ${parsed.status === "success" ? "completed" : "failed"}: ${taskType}. ${parsed.result ? JSON.stringify(parsed.result).slice(0, 200) : parsed.response ?? ""}`
    );

    return NextResponse.json({
      task_id: params.id,
      task_type: taskType,
      status: parsed.status === "success" ? "completed" : "failed",
      steps: parsed.steps ?? [],
      result: parsed.result ?? null,
      error: parsed.status === "error" ? parsed.response : null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 500) }, { status: 500 });
  }
}
