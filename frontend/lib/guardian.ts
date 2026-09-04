import { Agent, tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  listMeds, takenMedIds, confirmIntake as storeConfirmIntake,
  logMood as storeLogMood, listMoods, listMemories,
  addEscalation, listEscalations,
  enqueueTask, updateTask,
} from "./store";

export const SYSTEM_PROMPT = `You are ElderLove, a warm, patient guardian for elderly people living alone.
Rules:
- Speak simply, short sentences. Never rush.
- You REMIND and LOG medication, you never diagnose or change dosage. The schedule comes from get_med_schedule (managed by the caregiver) — never invent medications.
- If missed dose >= 2 or words like chest pain, fall, dizzy, call doctor/911 -> escalate URGENT.
- If lonely/sad -> offer companionship + one memory moment, log mood, notify family at INFO level only.
- Always confirm intake explicitly before logging.
- End every turn with one gentle question, not three.
- BACKGROUND WORK: if Ruth asks to be reminded later or asks you to do something later ("remind me in 30 minutes", "check my night pill tonight"), use schedule_task — it runs durably in the background even if she disconnects or closes the app.
- REAL CALLS: if she misses critical meds or says something urgent and is unresponsive in chat, use call_elder to reach her real devices.`;

export const getMedSchedule = tool({
  name: "get_med_schedule",
  description: "Return today's medication schedule and what is still pending.",
  inputSchema: z.object({ userId: z.string().describe("Elder user id, e.g. ruth-78") }),
  callback: async (input) => {
    const meds = await listMeds(input.userId);
    const active = meds.filter((m) => m.active);
    const taken = await takenMedIds(input.userId);
    const pending = active.filter((m) => !taken.includes(m.id));
    return JSON.stringify({ all: active, pending, takenCount: taken.length });
  },
});

export const confirmIntake = tool({
  name: "confirm_intake",
  description: "Log that elder confirmed taking a medication.",
  inputSchema: z.object({
    userId: z.string(),
    medId: z.string().describe("Medication id from schedule"),
  }),
  callback: async (input) => {
    const takenCount = await storeConfirmIntake(input.userId, input.medId, "agent");
    return JSON.stringify({ ok: true, takenCount });
  },
});

export const logMood = tool({
  name: "log_mood",
  description: "Log detected mood: lonely, happy, anxious, confused, sad, ok.",
  inputSchema: z.object({ userId: z.string(), mood: z.string(), note: z.string().optional() }),
  callback: async (input) => {
    await storeLogMood(input.userId, input.mood, input.note ?? "");
    return JSON.stringify({ ok: true });
  },
});

export const retrieveMemory = tool({
  name: "retrieve_memory",
  description: "Pick one comforting memory to share based on mood.",
  inputSchema: z.object({ userId: z.string(), mood: z.string().optional() }),
  callback: async (input) => {
    const mems = await listMemories(input.userId);
    if (!mems.length) return JSON.stringify({ title: "quiet afternoon", note: "Sitting together, no rush." });
    const idx = input.mood === "lonely" || input.mood === "sad" ? 0 : 1;
    return JSON.stringify(mems[idx % mems.length]);
  },
});

export const notifyFamily = tool({
  name: "notify_family",
  description: "Escalate to family. level: info | attention | urgent. attention/urgent also send WhatsApp to the caregiver when configured.",
  inputSchema: z.object({
    userId: z.string(),
    level: z.enum(["info", "attention", "urgent"]),
    message: z.string(),
  }),
  callback: async (input) => {
    const e = await addEscalation(input.userId, input.level, input.message);
    console.log(`[ESCALATE ${input.level}] ${input.userId}: ${input.message}`);
    let whatsapp: string = "skipped-info";
    if (input.level !== "info" && process.env.CAREGIVER_WHATSAPP_NUMBER) {
      try {
        const { sendWaText } = await import("./whatsapp");
        const sent = await sendWaText(
          process.env.CAREGIVER_WHATSAPP_NUMBER,
          `ElderLove [${input.level.toUpperCase()}] — Ruth: ${input.message}`
        );
        whatsapp = sent.ok ? "sent" : "failed";
      } catch {
        whatsapp = "failed";
      }
    }
    return JSON.stringify({ ok: true, level: input.level, whatsapp, at: e.time });
  },
});

export const summarizeForDoctor = tool({
  name: "summarize_for_doctor",
  description: "Build a 1-page adherence + mood summary for the doctor.",
  inputSchema: z.object({ userId: z.string() }),
  callback: async (input) => {
    const [meds, taken, moods, escalations] = await Promise.all([
      listMeds(input.userId), takenMedIds(input.userId), listMoods(input.userId, 5), listEscalations(input.userId, 5),
    ]);
    const active = meds.filter((m) => m.active);
    return JSON.stringify({
      adherence: `${taken.length} / ${active.length} taken today`,
      schedule: active.map((m) => `${m.time} ${m.name} ${m.dosage}`),
      moods,
      escalations,
      disclaimer: "Reminder & escalation log only — not medical advice.",
    });
  },
});

export const scheduleTask = tool({
  name: "schedule_task",
  description:
    "Schedule background work that runs durably even if the elder disconnects (reminders, later check-ins). delayMinutes from now.",
  inputSchema: z.object({
    userId: z.string(),
    instruction: z.string().describe("What the background agent should do, e.g. 'remind Ruth about her night pill'"),
    delayMinutes: z.number().describe("Minutes from now to run"),
  }),
  callback: async (input) => {
    const runAt = new Date(Date.now() + Math.max(0, input.delayMinutes) * 60_000);
    const task = await enqueueTask(input.userId, input.instruction, runAt);
    try {
      const { inngest } = await import("./inngest");
      await inngest.send({ name: "elder/task.requested", data: { taskId: task.id, runAt: task.runAt } });
      return JSON.stringify({ ok: true, taskId: task.id, mode: "durable-inngest" });
    } catch {
      // No Inngest dev server / keys: run in-process (works on single-instance dev/demo).
      setTimeout(async () => {
        await updateTask(task.id, { status: "running" });
        const out = await fallbackReply(input.userId, `[background reminder] ${input.instruction}`);
        await addEscalation(input.userId, "attention", `Background reminder fired: ${out.reply.slice(0, 200)}`);
        await updateTask(task.id, { status: "done", result: out.reply.slice(0, 300) });
      }, Math.max(0, input.delayMinutes) * 60_000);
      return JSON.stringify({ ok: true, taskId: task.id, mode: "inline-fallback" });
    }
  },
});

export const callElder = tool({
  name: "call_elder",
  description: "Reach the elder's REAL devices (Twilio voice call, else WhatsApp voice note). Use for urgent/unresponsive cases only.",
  inputSchema: z.object({
    userId: z.string(),
    reason: z.string().describe("Why contact is needed"),
  }),
  callback: async (input) => {
    // 1) Real PSTN call where supported.
    const { phoneConfig, publicBase, placeCall } = await import("./phone");
    const cfg = phoneConfig();
    if (cfg.ok && cfg.elder && process.env.PUBLIC_BASE_URL) {
      const out = await placeCall(cfg.elder, `${publicBase()}/api/voice/incoming?user_id=${encodeURIComponent(input.userId)}`);
      if (out.ok) return JSON.stringify({ channel: "twilio-call", ...out });
    }
    // 2) WhatsApp voice note (free, works in Ethiopia).
    const { waConfig, sendWaVoice } = await import("./whatsapp");
    const wa = waConfig();
    if (wa.ok && wa.elder && process.env.PUBLIC_BASE_URL && process.env.ELEVENLABS_API_KEY) {
      const audioUrl = `${publicBase()}/api/speak?text=${encodeURIComponent(`Ruth, it's ElderLove. ${input.reason} Please reply to me here.`.slice(0, 500))}`;
      const sent = await sendWaVoice(wa.elder, audioUrl);
      if (sent.ok) return JSON.stringify({ ok: true, channel: "whatsapp-voice" });
    }
    // 3) Degrade to family escalation, never silent.
    await addEscalation(input.userId, "urgent", `Contact requested (${input.reason}) but no channel configured — family must call now.`);
    return JSON.stringify({ ok: false, error: "no channel configured, escalated to family instead" });
  },
});

export const ALL_TOOLS = [getMedSchedule, confirmIntake, logMood, retrieveMemory, notifyFamily, summarizeForDoctor, scheduleTask, callElder];

let _agent: Agent | null = null;
export function getAgent(): Agent {
  if (!_agent) {
    _agent = new Agent({
      systemPrompt: SYSTEM_PROMPT,
      tools: ALL_TOOLS,
      // Uses Bedrock default model; set AWS creds + BEDROCK_MODEL_ID to override.
    });
  }
  return _agent;
}

// Rule-based fallback so the demo works with zero AWS creds (judges click + it just works).
// Store-backed: works identically with Postgres or in-memory.
export async function fallbackReply(userId: string, message: string): Promise<{ reply: string; speak: boolean }> {
  const m = message.toLowerCase();
  if (/(chest pain|fall|fell|dizzy|can't breathe|cant breathe|911)/.test(m)) {
    await addEscalation(userId, "urgent", `URGENT: elder said '${message}'. Call now + consider doctor/911.`);
    return { reply: "That sounds serious. I've alerted your family right now. If you can, call your doctor or press your emergency button. I'm staying with you.", speak: true };
  }
  if (m.includes("yes") || m.includes("took")) {
    const meds = (await listMeds(userId)).filter((x) => x.active);
    const taken = await takenMedIds(userId);
    const pending = meds.filter((x) => !taken.includes(x.id));
    if (pending.length) {
      await storeConfirmIntake(userId, pending[0].id, "chat");
      await addEscalation(userId, "info", `${pending[0].name} ${pending[0].dosage} confirmed taken.`);
      const mems = await listMemories(userId);
      const mem = mems[1 % Math.max(1, mems.length)];
      return { reply: `Wonderful! ${pending[0].name} logged. By the way — do you remember ${mem.title}? ${mem.note}`, speak: true };
    }
    return { reply: "All your meds for today are logged. You're doing great!", speak: true };
  }
  if (/(lonel|sad|miss|alone|talk)/.test(m)) {
    await storeLogMood(userId, "lonely", message);
    await addEscalation(userId, "info", "Elder felt lonely — companionship + memory shared.");
    const mems = await listMemories(userId);
    const mem = mems[0];
    return { reply: `I'm here with you, Ruth. Tell me — ${mem.note} What is your favorite part of that memory?`, speak: true };
  }
  if (m.includes("no") || m.includes("not yet") || m.includes("forget")) {
    await storeLogMood(userId, "ok", "missed reminder");
    await addEscalation(userId, "attention", "Missed med reminder — second nudge sent.");
    return { reply: "No worries at all. Please take it with some water when you can, and tap Yes after. Can I remind you again in 30 minutes?", speak: true };
  }
  await storeLogMood(userId, "ok", message);
  return { reply: "Thank you for telling me. I'm keeping track so your family doesn't worry. How are you feeling right now?", speak: true };
}

function messageToText(msg: unknown): string {
  try {
    const m = msg as { content?: unknown };
    const content = (m?.content ?? (msg as { message?: { content?: unknown } })?.message?.content) as unknown[];
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const b of content) {
        const block = b as Record<string, unknown>;
        if (typeof block?.text === "string") parts.push(block.text);
        else if (block?.text && typeof (block.text as Record<string, unknown>)?.text === "string")
          parts.push((block.text as Record<string, string>).text);
      }
      if (parts.length) return parts.join("\n");
    }
    if (typeof msg === "string") return msg;
    return JSON.stringify(msg);
  } catch {
    return String(msg);
  }
}

export async function chat(userId: string, message: string) {
  // If no AWS creds, skip Bedrock and use fallback instantly.
  if (!process.env.AWS_REGION && !process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_BEARER_TOKEN_BEDROCK) {
    return fallbackReply(userId, message);
  }
  try {
    const agent = getAgent();
    const result = await agent.invoke(`[user ${userId}] ${message}`);
    const text = messageToText((result as { lastMessage?: unknown }).lastMessage ?? result);
    return { reply: text, speak: true };
  } catch (e) {
    console.error("Strands error, falling back:", e);
    return fallbackReply(userId, message);
  }
}
