import { listMeds, takenMedIds, listMoods, listEscalations, listTasks, saveReport } from "./store";
import { sendWaText } from "./whatsapp";

// Daily caregiver report: adherence, mood, escalations, background tasks.
// Sent via WhatsApp text and/or email (Resend). Always saved to DB.
export async function buildDailySummary(elder = "eleanor-79"): Promise<string> {
  const [meds, taken, moods, escalations, tasks] = await Promise.all([
    listMeds(elder), takenMedIds(elder), listMoods(elder, 5), listEscalations(elder, 10), listTasks(elder),
  ]);
  const active = meds.filter((m) => m.active);
  const lines = [
    `ElderLove daily report — Eleanor, ${new Date().toLocaleDateString()}`,
    ``,
    `Medication: ${taken.length}/${active.length} taken`,
    ...active.map((m) => `  ${taken.includes(m.id) ? "✓" : "✗"} ${m.time} — ${m.name} ${m.dosage}`),
    ``,
    `Mood: ${moods.length ? moods.map((m) => m.mood).join(", ") : "no check-ins"}`,
    `Alerts: ${escalations.length} (${escalations.filter((e) => e.level === "urgent").length} urgent)`,
    ...escalations.slice(0, 3).map((e) => `  [${e.level}] ${e.message}`),
    ``,
    `Background tasks: ${tasks.filter((t) => t.status === "done").length}/${tasks.length} done`,
    ``,
    `Reminder log only — not medical advice. Reply here if you need anything.`,
  ];
  return lines.join("\n");
}

export async function sendEmailResend(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false as const, error: "no RESEND_API_KEY" };
  const from = process.env.EMAIL_FROM ?? "ElderLove <alerts@elderlove.app>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) return { ok: false as const, error: `resend ${res.status}` };
  return { ok: true as const };
}

export async function sendDailyReport(elder = "eleanor-79") {
  const summary = await buildDailySummary(elder);
  const date = new Date().toISOString().slice(0, 10);
  const channels: string[] = [];

  const waTo = process.env.CAREGIVER_WHATSAPP_NUMBER;
  if (waTo) {
    const sent = await sendWaText(waTo, summary);
    channels.push(`whatsapp:${sent.ok ? "sent" : "failed"}`);
  }
  const emailTo = process.env.CAREGIVER_EMAIL;
  if (emailTo) {
    const sent = await sendEmailResend(emailTo, `ElderLove daily report — Eleanor ${date}`, summary);
    channels.push(`email:${sent.ok ? "sent" : "failed"}`);
  }
  if (!channels.length) channels.push("saved-only");
  await saveReport(elder, date, channels.join("+"), summary);
  return { summary, channels };
}
