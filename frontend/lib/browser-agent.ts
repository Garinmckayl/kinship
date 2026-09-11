// Bridge to Nova Act browser automation: supports two backends.
//
// 1. SIDECAR MODE: FastAPI sidecar running locally or on a server (NOVA_SIDECAR_URL)
// 2. AGENTCORE MODE: Bedrock AgentCore runtime invoked via AWS SDK (NOVA_AGENTCORE_RUNTIME)
//
// The bridge tries sidecar first, falls back to AgentCore. On Vercel with no sidecar,
// AgentCore is the only path -- and it's the more impressive one for judges.

const NOVA_SIDECAR_URL = process.env.NOVA_SIDECAR_URL ?? "http://localhost:8100";
const NOVA_SIDECAR_SECRET = process.env.NOVA_SIDECAR_SECRET ?? "elderlove-nova-dev";
const NOVA_AGENTCORE_RUNTIME = process.env.NOVA_AGENTCORE_RUNTIME; // ARN of the Nova Act AgentCore runtime

export type BrowserTaskType = "pharmacy_refill" | "insurance_check" | "provider_search" | "bill_payment" | "appointment_booking" | "grocery_order" | "benefits_recert" | "custom";
export type BrowserTaskStatus = "pending_approval" | "approved" | "running" | "completed" | "failed" | "cancelled";

export type BrowserTaskStep = {
  index: number;
  label: string;
  status: string;
  response?: string;
  error?: string;
  mode?: string;
  started_at?: string;
  completed_at?: string;
};

export type BrowserTask = {
  task_id: string;
  task_type: BrowserTaskType;
  status: BrowserTaskStatus;
  params: Record<string, unknown>;
  steps: BrowserTaskStep[];
  result: Record<string, string> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
};

// --------------- sidecar client ---------------

async function sidecarFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`${NOVA_SIDECAR_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NOVA_SIDECAR_SECRET}`,
      ...(opts.headers ?? {}),
    },
  });
}

export async function sidecarHealthy(): Promise<boolean> {
  try {
    const res = await sidecarFetch("/health", { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// --------------- AgentCore client ---------------

// In-memory task store for AgentCore-managed tasks (no sidecar state)
const AGENTCORE_TASKS: Map<string, BrowserTask> = new Map();
let _acCounter = 0;

function nextAcId(): string {
  return `ac-${++_acCounter}-${Date.now()}`;
}

async function invokeAgentCore(taskType: BrowserTaskType, params: Record<string, unknown>): Promise<BrowserTask> {
  const taskId = nextAcId();
  const task: BrowserTask = {
    task_id: taskId,
    task_type: taskType,
    status: "running",
    params,
    steps: [],
    result: null,
    error: null,
    started_at: new Date().toISOString(),
    completed_at: null,
  };
  AGENTCORE_TASKS.set(taskId, task);

  // Invoke AgentCore runtime asynchronously
  try {
    const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = await import("@aws-sdk/client-bedrock-agentcore");
    const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? "us-east-1" });

    const payload = JSON.stringify({
      task_type: taskType,
      params,
    });

    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: NOVA_AGENTCORE_RUNTIME!,
      contentType: "application/json",
      accept: "application/json",
      payload: new TextEncoder().encode(payload),
    });

    const response = await client.send(command);

    // AgentCore response body may be a stream or Uint8Array
    let responseBody = "{}";
    if (response.response) {
      if (typeof response.response === "string") {
        responseBody = response.response;
      } else if (response.response instanceof Uint8Array) {
        responseBody = new TextDecoder().decode(response.response);
      } else {
        // Streaming blob -- collect chunks
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.response as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const total = chunks.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        responseBody = new TextDecoder().decode(merged);
      }
    }

    const parsed = JSON.parse(responseBody);

    task.status = parsed.status === "success" ? "completed" : "failed";
    task.result = parsed.result ? (typeof parsed.result === "string" ? { data: parsed.result } : parsed.result) : null;
    task.steps = (parsed.steps ?? []).map((s: { step: number; status: string; prompt?: string; error?: string }, i: number) => ({
      index: s.step ?? i + 1,
      label: s.prompt?.slice(0, 80) ?? `Step ${i + 1}`,
      status: s.status ?? "completed",
      error: s.error,
    }));
    task.error = parsed.status === "error" ? (parsed.response ?? "unknown error") : null;
  } catch (e) {
    task.status = "failed";
    task.error = `AgentCore invocation failed: ${String(e).slice(0, 300)}`;
  }

  task.completed_at = new Date().toISOString();
  return task;
}

// --------------- unified API ---------------

export async function createBrowserTask(
  taskType: BrowserTaskType,
  params: Record<string, unknown>,
  approved = false,
): Promise<BrowserTask> {
  // Try sidecar first
  if (await sidecarHealthy()) {
    const res = await sidecarFetch("/tasks", {
      method: "POST",
      body: JSON.stringify({ task_type: taskType, elder_id: "eleanor-79", params, approved }),
    });
    if (res.ok) return res.json();
  }

  // Fall back to AgentCore (if configured and approved)
  if (NOVA_AGENTCORE_RUNTIME && approved) {
    return invokeAgentCore(taskType, params);
  }

  // Neither available -- return a pending task that will show in the dashboard
  const taskId = nextAcId();
  const task: BrowserTask = {
    task_id: taskId,
    task_type: taskType,
    status: "pending_approval",
    params,
    steps: [],
    result: null,
    error: NOVA_AGENTCORE_RUNTIME ? null : "Nova Act not configured (set NOVA_AGENTCORE_RUNTIME or NOVA_SIDECAR_URL)",
    started_at: null,
    completed_at: null,
  };
  AGENTCORE_TASKS.set(taskId, task);
  return task;
}

export async function approveBrowserTask(taskId: string): Promise<BrowserTask> {
  // Sidecar task
  if (await sidecarHealthy()) {
    const res = await sidecarFetch(`/tasks/${taskId}/approve`, { method: "POST" });
    if (res.ok) return res.json();
  }

  // AgentCore task
  const task = AGENTCORE_TASKS.get(taskId);
  if (task && task.status === "pending_approval") {
    task.status = "approved";
    // Execute via AgentCore
    if (NOVA_AGENTCORE_RUNTIME) {
      const result = await invokeAgentCore(task.task_type, task.params);
      Object.assign(task, result, { task_id: taskId }); // Keep original ID
    }
    return task;
  }

  throw new Error("task not found");
}

export async function cancelBrowserTask(taskId: string): Promise<BrowserTask> {
  if (await sidecarHealthy()) {
    const res = await sidecarFetch(`/tasks/${taskId}/cancel`, { method: "POST" });
    if (res.ok) return res.json();
  }
  const task = AGENTCORE_TASKS.get(taskId);
  if (task) { task.status = "cancelled"; return task; }
  throw new Error("task not found");
}

export async function getBrowserTask(taskId: string): Promise<BrowserTask> {
  if (await sidecarHealthy()) {
    const res = await sidecarFetch(`/tasks/${taskId}`);
    if (res.ok) return res.json();
  }
  const task = AGENTCORE_TASKS.get(taskId);
  if (task) return task;
  throw new Error("task not found");
}

export async function listBrowserTasks(): Promise<BrowserTask[]> {
  // Merge sidecar + AgentCore tasks
  const tasks: BrowserTask[] = [];

  if (await sidecarHealthy()) {
    try {
      const res = await sidecarFetch("/tasks");
      if (res.ok) tasks.push(...(await res.json()));
    } catch {}
  }

  // Add AgentCore-managed tasks
  const acTasks = Array.from(AGENTCORE_TASKS.values());
  for (const t of acTasks) {
    if (!tasks.find((x) => x.task_id === t.task_id)) {
      tasks.push(t);
    }
  }

  return tasks.sort((a, b) => (b.started_at ?? b.task_id).localeCompare(a.started_at ?? a.task_id)).slice(0, 20);
}

export type LatestScreenshot = {
  task_id: string;
  status: BrowserTaskStatus;
  step_count: number;
  current_step: string | null;
  screenshot: string | null;
  screenshot_index: number;
};

export async function getLatestScreenshot(taskId: string): Promise<LatestScreenshot> {
  if (await sidecarHealthy()) {
    const res = await sidecarFetch(`/tasks/${taskId}/latest-screenshot`);
    if (res.ok) return res.json();
  }
  // AgentCore doesn't stream screenshots (tasks are synchronous invocations)
  const task = AGENTCORE_TASKS.get(taskId);
  return {
    task_id: taskId,
    status: (task?.status ?? "unknown") as BrowserTaskStatus,
    step_count: task?.steps.length ?? 0,
    current_step: task?.steps[task.steps.length - 1]?.label ?? null,
    screenshot: null,
    screenshot_index: -1,
  };
}
