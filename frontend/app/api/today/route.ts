import { NextResponse } from "next/server";
import { listMeds, takenMedIds, listMoods, listTasks, listAppointments } from "@/lib/store";

// Elder "today" board: meds w/ taken flags, check-in state, pending tasks, today's appointments.
export async function GET() {
  const [meds, taken, moods, tasks, appts] = await Promise.all([
    listMeds("ruth-78"), takenMedIds("ruth-78"), listMoods("ruth-78", 3), listTasks("ruth-78"), listAppointments("ruth-78"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const active = meds.filter((m) => m.active).sort((a, b) => a.time.localeCompare(b.time));
  return NextResponse.json({
    meds: active.map((m) => ({ ...m, taken: taken.includes(m.id) })),
    checkedInToday: moods.length > 0,
    tasksPending: tasks.filter((t) => t.status === "pending" || t.status === "running").length,
    appointmentsToday: appts.filter((a) => new Date(a.at).toISOString().slice(0, 10) === today),
    done: active.length > 0 && active.every((m) => taken.includes(m.id)),
  });
}
