// Background task store. In-memory for demo/hackathon — swap to Vercel KV,
// DynamoDB, or Inngest state in production (see README).
export type TaskStatus = "pending" | "running" | "done" | "failed";

export type ElderTask = {
  id: string;
  userId: string;
  instruction: string;
  runAt: string; // ISO
  status: TaskStatus;
  result?: string;
  createdAt: string;
};

const TASKS: ElderTask[] = [];

export function enqueueTask(userId: string, instruction: string, runAt: Date): ElderTask {
  const task: ElderTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    instruction,
    runAt: runAt.toISOString(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  TASKS.unshift(task);
  return task;
}

export function listTasks(userId?: string): ElderTask[] {
  return (userId ? TASKS.filter((t) => t.userId === userId) : TASKS).slice(0, 20);
}

export function getTask(id: string) {
  return TASKS.find((t) => t.id === id);
}

export function updateTask(id: string, patch: Partial<ElderTask>) {
  const t = getTask(id);
  if (t) Object.assign(t, patch);
  return t;
}
