import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { executeClaimedBackgroundTask } from "@/lib/background-tasks";
import {
  claimDueTasks,
  clearBackgroundTaskHistory,
  listTasks,
} from "@/lib/store";

async function executeDueTasks(userId?: string) {
  const [task] = await claimDueTasks(userId, 1);
  if (!task) return;
  try {
    await executeClaimedBackgroundTask(task);
  } catch (error) {
    console.error("Background task will be retried", { taskId: task.id, error });
  }
}

export async function GET(req: Request) {
  try {
    await requireCaregiver();
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") ?? "eleanor-79";
    await executeDueTasks(userId);
    return NextResponse.json({ tasks: await listTasks(userId) });
  } catch (error) {
    return error instanceof Response ? error : NextResponse.json({ error: "failed to load background tasks" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireCaregiver();
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") ?? "eleanor-79";
    const cleared = await clearBackgroundTaskHistory(userId);
    return NextResponse.json({ ok: true, cleared });
  } catch (error) {
    return error instanceof Response ? error : NextResponse.json({ error: "failed to clear background task history" }, { status: 500 });
  }
}
