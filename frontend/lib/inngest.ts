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
      const { getTask, updateTask } = await import("./tasks");
      const { chat } = await import("./guardian");
      const task = getTask(taskId);
      if (!task) return { ok: false, error: "task not found" };
      updateTask(taskId, { status: "running" });
      try {
        const out = await chat(task.userId, `[background task — Ruth may be offline, act via tools and escalate if needed] ${task.instruction}`);
        updateTask(taskId, { status: "done", result: out.reply.slice(0, 500) });
        return { ok: true };
      } catch (e) {
        updateTask(taskId, { status: "failed", result: String(e).slice(0, 300) });
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
      const { enqueueTask } = await import("./tasks");
      const task = enqueueTask(
        "ruth-78",
        "Morning check-in: warmly greet Ruth, confirm Lisinopril intake, sense mood, share one memory. Escalate to family only if something is wrong.",
        new Date()
      );
      await inngest.send({ name: "elder/task.requested", data: { taskId: task.id } });
      return { taskId: task.id };
    });
  }
);

export const functions = [processElderTask, morningCheckin];
