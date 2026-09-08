// Bridge to Nova Act sidecar: browser automation for elders.
// The sidecar runs Nova Act (Python) and this bridge provides
// the Next.js API surface for the guardian agent + family dashboard.

const NOVA_SIDECAR_URL = process.env.NOVA_SIDECAR_URL ?? "http://localhost:8100";
const NOVA_SIDECAR_SECRET = process.env.NOVA_SIDECAR_SECRET ?? "elderlove-nova-dev";

export type BrowserTaskType = "pharmacy_refill" | "bill_payment" | "appointment_booking" | "grocery_order" | "custom";
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

export async function createBrowserTask(
  taskType: BrowserTaskType,
  params: Record<string, unknown>,
  approved = false,
): Promise<BrowserTask> {
  const res = await sidecarFetch("/tasks", {
    method: "POST",
    body: JSON.stringify({ task_type: taskType, elder_id: "eleanor-79", params, approved }),
  });
  if (!res.ok) throw new Error(`sidecar error: ${res.status}`);
  return res.json();
}

export async function approveBrowserTask(taskId: string): Promise<BrowserTask> {
  const res = await sidecarFetch(`/tasks/${taskId}/approve`, { method: "POST" });
  if (!res.ok) throw new Error(`sidecar error: ${res.status}`);
  return res.json();
}

export async function cancelBrowserTask(taskId: string): Promise<BrowserTask> {
  const res = await sidecarFetch(`/tasks/${taskId}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(`sidecar error: ${res.status}`);
  return res.json();
}

export async function getBrowserTask(taskId: string): Promise<BrowserTask> {
  const res = await sidecarFetch(`/tasks/${taskId}`);
  if (!res.ok) throw new Error(`sidecar error: ${res.status}`);
  return res.json();
}

export async function listBrowserTasks(): Promise<BrowserTask[]> {
  const res = await sidecarFetch("/tasks");
  if (!res.ok) throw new Error(`sidecar error: ${res.status}`);
  return res.json();
}

export async function sidecarHealthy(): Promise<boolean> {
  try {
    const res = await sidecarFetch("/health", { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
