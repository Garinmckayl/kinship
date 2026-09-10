import { getSession } from "@/lib/auth";

const SIDECAR_URL = process.env.NOVA_SIDECAR_URL || "http://98.92.77.193:8100";
const SIDECAR_SECRET = process.env.NOVA_SIDECAR_SECRET ?? "elderlove-nova-dev";

export async function POST(req: Request) {
  const u = await getSession();
  if (!u) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const watchTaskId = body.task_id as string | undefined;

  if (!SIDECAR_URL) {
    return new Response(
      `data: ${JSON.stringify({ error: "Sidecar not configured" })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }
    );
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastState = "";
      let pollCount = 0;
      const maxPolls = 300; // 5 minutes at 1s intervals

      try {
        // Initial fetch
        const initialRes = await fetch(`${SIDECAR_URL}/tasks`, {
          headers: { Authorization: `Bearer ${SIDECAR_SECRET}` },
          signal: AbortSignal.timeout(5000),
        });

        if (!initialRes.ok) {
          controller.enqueue(
            enc.encode(`data: ${JSON.stringify({ error: "Sidecar unavailable" })}\n\n`)
          );
          controller.close();
          return;
        }

        const tasks: Record<string, unknown>[] = await initialRes.json();

        const sendUpdate = (tasklist: Record<string, unknown>[]) => {
          const filtered = watchTaskId
            ? tasklist.filter((t) => String(t.task_id) === watchTaskId)
            : tasklist;
          const update = { tasks: filtered, timestamp: new Date().toISOString() };
          const state = JSON.stringify(update);
          if (state !== lastState) {
            lastState = state;
            controller.enqueue(enc.encode(`data: ${state}\n\n`));
          }
        };

        sendUpdate(tasks);

        // Poll for updates every 1s until task completes or timeout
        const pollInterval = setInterval(async () => {
          pollCount++;
          if (pollCount > maxPolls) {
            clearInterval(pollInterval);
            controller.close();
            return;
          }

          try {
            const res = await fetch(`${SIDECAR_URL}/tasks`, {
              headers: { Authorization: `Bearer ${SIDECAR_SECRET}` },
              signal: AbortSignal.timeout(5000),
            });

            if (res.ok) {
              const newTasks: Record<string, unknown>[] = await res.json();
              sendUpdate(newTasks);

              // Check if watched task is done
              if (watchTaskId) {
                const task = newTasks.find((t) => String(t.task_id) === watchTaskId);
                if (task && (task.status === "completed" || task.status === "failed")) {
                  clearInterval(pollInterval);
                  controller.close();
                  return;
                }
              }
            }
          } catch {
            // Silently continue polling on error
          }
        }, 1000);

        // Cleanup on abort
        req.signal?.addEventListener("abort", () => {
          clearInterval(pollInterval);
          controller.close();
        });
      } catch (e) {
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({ error: String(e).slice(0, 200) })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

