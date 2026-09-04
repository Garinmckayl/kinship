import { NextResponse } from "next/server";
import { MEDS, MEMORIES, getState } from "@/lib/demo-data";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id") ?? "ruth-78";
  const st = getState(userId);
  const moods = st.moods;
  return NextResponse.json({
    elder: "Ruth, 78",
    adherence_today: `${Object.keys(st.intakes).length} / ${MEDS.length} taken`,
    mood: moods.length ? moods[moods.length - 1].mood : "ok",
    last_checkin: "just now",
    escalations: [...st.escalations].reverse().slice(0, 10),
    memories: MEMORIES.slice(0, 3),
  });
}
