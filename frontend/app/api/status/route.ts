import { NextResponse } from "next/server";
import { listMeds, takenMedIds, lastMood, listEscalations, listMemories, lastHeartbeat } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id") ?? "eleanor-79";
  const [meds, taken, mood, escalations, memories, hb] = await Promise.all([
    listMeds(userId), takenMedIds(userId), lastMood(userId), listEscalations(userId, 10), listMemories(userId), lastHeartbeat(userId),
  ]);
  const active = meds.filter((m) => m.active);
  return NextResponse.json({
    elder: "Eleanor, 79",
    adherence_today: `${taken.length} / ${active.length} taken`,
    mood,
    last_checkin: "just now",
    last_activity: hb,
    escalations,
    memories: memories.slice(0, 3),
  });
}
