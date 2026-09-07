import { Agent, tool } from "@strands-agents/sdk";
import { z } from "zod";
import { getMedSchedule, summarizeForDoctor, scheduleTask } from "./guardian";
import { listMeds, takenMedIds, lastMood, listEscalations, listTasks, listAppointments, healthTrends, addMed, addEscalation } from "./store";

// Family-facing agent: answers anything about Eleanor from live data,
// manages meds, and nudges Eleanor in realtime.
const CAREGIVER_PROMPT = `You are ElderLove's family assistant, talking to Eleanor's caregiver.
Rules:
- Answer ONLY from tool data (medications, adherence, mood, alerts, appointments, health). Never invent readings or doses.
- You can add medications (add_medication), ping Eleanor right now (remind_parent_now), or schedule later nudges (schedule_task).
- Be concise, warm, specific with times and numbers. Today is ${new Date().toISOString().slice(0, 10)}.`;

export async function parentSnapshot(): Promise<string> {
  const [meds, taken, mood, escalations, tasks, appts, health] = await Promise.all([
    listMeds("eleanor-79"), takenMedIds("eleanor-79"), lastMood("eleanor-79"),
    listEscalations("eleanor-79", 5), listTasks("eleanor-79"), listAppointments("eleanor-79"), healthTrends("eleanor-79"),
  ]);
  const active = meds.filter((m) => m.active);
  return JSON.stringify({
    adherence: `${taken.length}/${active.length} taken today`,
    schedule: active.map((m) => ({ time: m.time, name: `${m.name} ${m.dosage}`, taken: taken.includes(m.id) })),
    mood, escalations,
    tasksPending: tasks.filter((t) => t.status === "pending" || t.status === "running").length,
    upcomingAppointments: appts.slice(0, 3),
    health,
  });
}

export const parentStatus = tool({
  name: "parent_status",
  description: "Full live snapshot of Eleanor: adherence, mood, recent alerts, tasks, appointments, health trends.",
  inputSchema: z.object({}),
  callback: async () => parentSnapshot(),
});

export const addMedication = tool({
  name: "add_medication",
  description: "Add a medication to Eleanor's schedule.",
  inputSchema: z.object({
    name: z.string(), dosage: z.string().optional(), time: z.string().describe("HH:MM 24h"), label: z.string().optional(),
  }),
  callback: async (input) => {
    if (!/^\d{2}:\d{2}$/.test(input.time)) return JSON.stringify({ ok: false, error: "time must be HH:MM" });
    const med = await addMed("eleanor-79", { name: input.name, dosage: input.dosage ?? "", time: input.time, label: input.label ?? "" });
    return JSON.stringify({ ok: true, med });
  },
});

export const remindParentNow = tool({
  name: "remind_parent_now",
  description: "Ping Eleanor RIGHT NOW (dashboard escalation + WhatsApp text if configured).",
  inputSchema: z.object({ message: z.string().describe("What to tell Eleanor") }),
  callback: async (input) => {
    await addEscalation("eleanor-79", "attention", `Caregiver ping: ${input.message}`);
    let whatsapp = "skipped";
    const to = process.env.ELDER_WHATSAPP_NUMBER;
    if (to) {
      try {
        const { sendWaText } = await import("./whatsapp");
        whatsapp = (await sendWaText(to, `From your family via ElderLove: ${input.message}`)).ok ? "sent" : "failed";
      } catch { whatsapp = "failed"; }
    }
    return JSON.stringify({ ok: true, whatsapp });
  },
});

let _cg: Agent | null = null;
export function getCaregiverAgent(): Agent {
  if (!_cg) {
    _cg = new Agent({
      systemPrompt: CAREGIVER_PROMPT,
      tools: [parentStatus, getMedSchedule, summarizeForDoctor, addMedication, remindParentNow, scheduleTask],
      printer: false,
      contextManager: "auto",
    });
  }
  return _cg;
}

export async function caregiverChat(message: string) {
  const hasCreds = !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_BEARER_TOKEN_BEDROCK);
  if (!hasCreds) {
    const s = await parentSnapshot();
    return { reply: `Live data (agent brain offline — add AWS creds for full chat):\n${s}`, speak: false };
  }
  try {
    const agent = getCaregiverAgent();
    const result = await agent.invoke(`[caregiver] ${message}`);
    const last = (result as { lastMessage?: unknown }).lastMessage as { content?: { text?: string | { text?: string } }[] } | undefined;
    const parts: string[] = [];
    for (const b of last?.content ?? []) {
      if (typeof b.text === "string") parts.push(b.text);
      else if (typeof b.text?.text === "string") parts.push(b.text.text);
    }
    return { reply: parts.join("\n") || JSON.stringify(last), speak: false };
  } catch (e) {
    return { reply: `I hit an error: ${String(e).slice(0, 200)}`, speak: false };
  }
}
