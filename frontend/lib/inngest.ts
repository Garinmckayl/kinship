import { Inngest } from "inngest";

// Durable background execution: tasks survive elder disconnects, server
// restarts, and long sleeps. Without Inngest creds / dev server, callers
// fall back to in-process execution (see schedule_task tool).
export const inngest = new Inngest({ id: "elderlove" });

// 9am ET daily proactive check-in (13:00 UTC).
export const CHECKIN_CRON = "0 13 * * *";

export const processElderTask = inngest.createFunction(
  {
    id: "process-elder-task",
    retries: 2,
    triggers: [{ event: "elder/task.requested" }],
  },
  async ({ event, step }) => {
    const { taskId } = event.data as { taskId: string };

    const runAt: string | undefined = (event.data as { runAt?: string }).runAt;
    if (runAt && new Date(runAt).getTime() > Date.now()) {
      await step.sleepUntil("wait-until-run", new Date(runAt));
    }

    const outcome = await step.run("execute-agent-task", async () => {
      const { getTask, updateTask } = await import("./store");
      const { chat } = await import("./guardian");
      const task = await getTask(taskId);
      if (!task) return { ok: false, error: "task not found" };
      await updateTask(taskId, { status: "running" });
      try {
        const out = await chat(task.userId, `[background task — Eleanor may be offline, act via tools and escalate if needed] ${task.instruction}`, { heartbeat: false });
        await updateTask(taskId, { status: "done", result: out.reply.slice(0, 500) });
        return { ok: true };
      } catch (e) {
        await updateTask(taskId, { status: "failed", result: String(e).slice(0, 300) });
        return { ok: false };
      }
    });
    return outcome;
  }
);

export const morningCheckin = inngest.createFunction(
  {
    id: "morning-checkin",
    retries: 1,
    triggers: [{ cron: CHECKIN_CRON }],
  },
  async ({ step }) => {
    await step.run("enqueue-checkin", async () => {
      const { enqueueTask } = await import("./store");
      const task = await enqueueTask(
        "eleanor-79",
        "Morning check-in: warmly greet Eleanor, confirm Lisinopril intake, sense mood, share one memory. Escalate to family only if something is wrong.",
        new Date()
      );
      await inngest.send({ name: "elder/task.requested", data: { taskId: task.id } });
      return { taskId: task.id };
    });
  }
);

// 8pm ET caregiver digest (00:00 UTC next day).
export const dailyReport = inngest.createFunction(
  {
    id: "daily-report",
    retries: 1,
    triggers: [{ cron: "0 0 * * *" }],
  },
  async ({ step }) => {
    await step.run("build-and-send-report", async () => {
      const { sendDailyReport } = await import("./notify");
      return sendDailyReport("eleanor-79");
    });
  }
);

// Welfare sweep every 30 min: silence is the emergency.
// Now also runs compound-risk assessment for cross-domain detection.
export const welfareCheck = inngest.createFunction(
  {
    id: "welfare-check",
    retries: 1,
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    const sweep = await step.run("sweep", async () => {
      const { welfareSweep } = await import("./welfare");
      return welfareSweep("eleanor-79");
    });

    const risk = await step.run("compound-risk", async () => {
      const { assessCompoundRisk } = await import("./compound-risk");
      return assessCompoundRisk("eleanor-79");
    });

    return { sweep, risk: { level: risk.riskLevel, action: risk.action, signals: risk.signals.length, escalated: risk.escalated } };
  }
);

// Browser task execution via AgentCore (durable, survives Vercel 10s timeout).
// Triggered by: inngest.send({ name: "elder/browser-task.approved", data: { taskId, taskType, params } })
export const processBrowserTask = inngest.createFunction(
  {
    id: "process-browser-task",
    retries: 1,
    triggers: [{ event: "elder/browser-task.approved" }],
  },
  async ({ event, step }) => {
    const { taskId, taskType, params } = event.data as { taskId: string; taskType: string; params: Record<string, unknown> };

    // Mark as running
    await step.run("mark-running", async () => {
      const { updateBrowserTask, addEscalation } = await import("./store");
      await updateBrowserTask(taskId, { status: "running" });
      await addEscalation("eleanor-79", "info", `Browser task executing via AgentCore: ${taskType}`);
    });

    // Invoke AgentCore (this is the long-running step — Inngest handles the timeout)
    const result = await step.run("invoke-agentcore", async () => {
      const RUNTIME_ARN = process.env.NOVA_AGENTCORE_RUNTIME;
      if (!RUNTIME_ARN) return { status: "error", response: "NOVA_AGENTCORE_RUNTIME not configured" };

      const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = await import("@aws-sdk/client-bedrock-agentcore");
      const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? "us-east-1" });

      const payload = JSON.stringify({ task_type: taskType, params });
      const command = new InvokeAgentRuntimeCommand({
        agentRuntimeArn: RUNTIME_ARN,
        contentType: "application/json",
        accept: "application/json",
        payload: new TextEncoder().encode(payload),
      });

      try {
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
            const merged = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
            let offset = 0;
            for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
            responseBody = new TextDecoder().decode(merged);
          }
        }
        return JSON.parse(responseBody);
      } catch (e) {
        return { status: "error", response: String(e).slice(0, 500) };
      }
    });

    // Store result in DB
    await step.run("store-result", async () => {
      const { updateBrowserTask, addEscalation } = await import("./store");
      const ok = result.status === "success";
      await updateBrowserTask(taskId, {
        status: ok ? "completed" : "failed",
        steps: result.steps ?? [],
        result: result.result ?? null,
        error: ok ? null : (result.response ?? "unknown error"),
      });
      await addEscalation("eleanor-79",
        ok ? "info" : "attention",
        `Browser task ${ok ? "completed" : "failed"}: ${taskType}. ${result.result ? JSON.stringify(result.result).slice(0, 200) : result.response ?? ""}`,
      );
    });

    return { taskId, status: result.status };
  }
);

export const functions = [processElderTask, morningCheckin, dailyReport, welfareCheck, processBrowserTask];
