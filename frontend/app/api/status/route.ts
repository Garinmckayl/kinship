import { NextResponse } from "next/server";
import { listMeds, takenMedIds, lastMood, listEscalations, listMemories } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id") ?? "ruth-78";
  const [meds, taken, mood, escalations, memories] = await Promise.all([
    listMeds(userId), takenMedIds(userId), lastMood(userId), listEscalations(userId, 10), listMemories(userId),
  ]);
  const active = meds.filter((m) => m.active);
  return NextResponse.json({
    elder: "Ruth, 78",
    adherence_today: `${taken.length} / ${active.length} taken`,
    mood,
    last_checkin: "just now",
    escalations,
    memories: memories.slice(0, 3),
  });
}
