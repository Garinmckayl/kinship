import type { Appt } from "./store";

export async function syncAppointmentToGoogle(appt: Appt) {
  try {
    const { gcalOn, gcalCreate } = await import("./gcal");
    if (!gcalOn()) return { ok: false, skipped: true };
    const end = new Date(new Date(appt.at).getTime() + 60 * 60_000).toISOString();
    const result = await gcalCreate({
      title: appt.title,
      description: "Kinship appointment for Eleanor. " + (appt.notes ?? ""),
      startISO: appt.at,
      endISO: end,
      location: appt.location ?? "",
    });
    if (result.ok) {
      const { q } = await import("./db");
      await q("update appointments set google_event_id=$1 where id=$2", [(result as { eventId?: string }).eventId ?? "", appt.id]);
    }
    return result;
  } catch (error) {
    console.error("Google Calendar sync failed:", error);
    return { ok: false, error: "calendar sync failed" };
  }
}
