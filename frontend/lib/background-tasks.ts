import type { BgTask } from "./store";
import { finishClaimedTaskWithDelivery, releaseClaimedTask } from "./store";

export async function executeClaimedBackgroundTask(task: BgTask) {
  if (!task.claimToken) throw new Error(`Task ${task.id} has no claim token`);

  try {
    const { runBackgroundInstruction } = await import("./guardian");
    const result = runBackgroundInstruction(task.instruction).slice(0, 500);
    return finishClaimedTaskWithDelivery(task, result);
  } catch (error) {
    console.error("Background task execution failed", { taskId: task.id, error });
    await releaseClaimedTask(task.id, task.claimToken);
    throw error;
  }
}
