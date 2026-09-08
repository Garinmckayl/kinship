import { NextResponse } from "next/server";
import { listMeds, takenMedIds, lastMood, listEscalations, listMemories, lastHeartbeat } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id") ?? "eleanor-79";
  const [meds, taken, mood, escalations, memories, hb] = await Promise.all([
    listMeds(userId), takenMedIds(userId), lastMood(userId), listEscalations(userId, 10), listMemories(userId), lastHeartbeat(userId),
  ]);
  const active = meds.filter((m) => m.active);
  const lastCheckin = hb
    ? (hb.minutesAgo < 1 ? "just now" : hb.minutesAgo < 60 ? `${hb.minutesAgo} min ago` : `${Math.floor(hb.minutesAgo / 60)}h ago`)
    : "no activity yet";
  return NextResponse.json({
    elder: "Eleanor, 79",
    adherence_today: `${taken.length} / ${active.length} taken`,
    mood,
    last_checkin: lastCheckin,
    last_activity: hb,
    escalations,
    memories: memories.slice(0, 3),
  });
}
