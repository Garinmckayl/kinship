import { Agent, tool } from "@strands-agents/sdk";
import { z } from "zod";
import { MEDS, MEMORIES, getState } from "./demo-data";

export const SYSTEM_PROMPT = `You are ElderLove, a warm, patient guardian for elderly people living alone.
Rules:
- Speak simply, short sentences. Never rush.
- You REMIND and LOG medication, you never diagnose or change dosage.
- If missed dose >= 2 or words like chest pain, fall, dizzy, call doctor/911 -> escalate URGENT.
- If lonely/sad -> offer companionship + one memory moment, log mood, notify family at INFO level only.
- Always confirm intake explicitly before logging.
- End every turn with one gentle question, not three.
- BACKGROUND WORK: if Ruth asks to be reminded later or asks you to do something later ("remind me in 30 minutes", "check my night pill tonight"), use schedule_task — it runs durably in the background even if she disconnects or closes the app.
- REAL CALLS: if she misses critical meds or says something urgent and is unresponsive in chat, use call_elder to ring her actual phone.`;

export const getMedSchedule = tool({
  name: "get_med_schedule",
  description: "Return today's medication schedule and what is still pending.",
  inputSchema: z.object({ userId: z.string().describe("Elder user id, e.g. ruth-78") }),
  callback: (input) => {
    const taken = getState(input.userId).intakes;
    const pending = MEDS.filter((m) => !(m.id in taken));
    return JSON.stringify({ all: MEDS, pending, takenCount: Object.keys(taken).length });
  },
});

export const confirmIntake = tool({
  name: "confirm_intake",
  description: "Log that elder confirmed taking a medication.",
  inputSchema: z.object({
    userId: z.string(),
    medId: z.string().describe("Medication id from schedule"),
  }),
  callback: (input) => {
    const st = getState(input.userId);
    st.intakes[input.medId] = new Date().toISOString();
    return JSON.stringify({ ok: true, takenCount: Object.keys(st.intakes).length });
  },
});

export const logMood = tool({
  name: "log_mood",
  description: "Log detected mood: lonely, happy, anxious, confused, sad, ok.",
  inputSchema: z.object({ userId: z.string(), mood: z.string(), note: z.string().optional() }),
  callback: (input) => {
    getState(input.userId).moods.push({ mood: input.mood, note: input.note ?? "", at: new Date().toISOString() });
    return JSON.stringify({ ok: true });
  },
});

export const retrieveMemory = tool({
  name: "retrieve_memory",
  description: "Pick one comforting memory to share based on mood.",
  inputSchema: z.object({ userId: z.string(), mood: z.string().optional() }),
  callback: (input) => {
    const idx = input.mood === "lonely" || input.mood === "sad" ? 0 : 1;
    return JSON.stringify(MEMORIES[idx % MEMORIES.length]);
  },
});

export const notifyFamily = tool({
  name: "notify_family",
  description: "Escalate to family. level: info | attention | urgent.",
  inputSchema: z.object({
    userId: z.string(),
    level: z.enum(["info", "attention", "urgent"]),
    message: z.string(),
  }),
  callback: (input) => {
    getState(input.userId).escalations.push({
      level: input.level,
      message: input.message,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    });
    // TODO: wire to SNS/Twilio SMS here
    console.log(`[ESCALATE ${input.level}] ${input.userId}: ${input.message}`);
    return JSON.stringify({ ok: true, level: input.level });
  },
});

export const summarizeForDoctor = tool({
  name: "summarize_for_doctor",
  description: "Build a 1-page adherence + mood summary for the doctor.",
  inputSchema: z.object({ userId: z.string() }),
  callback: (input) => {
    const st = getState(input.userId);
    return JSON.stringify({
      adherence: `${Object.keys(st.intakes).length} / ${MEDS.length} taken today`,
      moods: st.moods.slice(-5),
      escalations: st.escalations.slice(-5),
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
    const { enqueueTask } = await import("./tasks");
    const runAt = new Date(Date.now() + Math.max(0, input.delayMinutes) * 60_000);
    const task = enqueueTask(input.userId, input.instruction, runAt);
    try {
      const { inngest } = await import("./inngest");
      await inngest.send({ name: "elder/task.requested", data: { taskId: task.id, runAt: task.runAt } });
      return JSON.stringify({ ok: true, taskId: task.id, mode: "durable-inngest" });
    } catch {
      // No Inngest dev server / keys: run in-process (works on single-instance dev/demo).
      const { updateTask } = await import("./tasks");
      setTimeout(async () => {
        updateTask(task.id, { status: "running" });
        const out = fallbackReply(input.userId, `[background reminder] ${input.instruction}`);
        const { getState } = await import("./demo-data");
        getState(input.userId).escalations.push({ level: "attention", message: `⏰ Background reminder fired: ${out.reply.slice(0, 200)}`, time: "now" });
        updateTask(task.id, { status: "done", result: out.reply.slice(0, 300) });
      }, Math.max(0, input.delayMinutes) * 60_000);
      return JSON.stringify({ ok: true, taskId: task.id, mode: "inline-fallback" });
    }
  },
});

export const callElder = tool({
  name: "call_elder",
  description: "Ring the elder's REAL phone via Twilio voice call. Use for urgent/unresponsive cases only.",
  inputSchema: z.object({
    userId: z.string(),
    reason: z.string().describe("Why the call is needed"),
  }),
  callback: async (input) => {
    const { phoneConfig, publicBase, placeCall } = await import("./phone");
    const cfg = phoneConfig();
    if (!cfg.ok || !cfg.elder || !process.env.PUBLIC_BASE_URL) {
      const { getState } = await import("./demo-data");
      getState(input.userId).escalations.push({ level: "urgent", message: `Call requested (${input.reason}) but phone not configured — family must call now.`, time: "now" });
      return JSON.stringify({ ok: false, error: "phone not configured, escalated to family instead" });
    }
    const out = await placeCall(cfg.elder, `${publicBase()}/api/voice/incoming?user_id=${encodeURIComponent(input.userId)}`);
    return JSON.stringify(out);
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
export function fallbackReply(userId: string, message: string): { reply: string; speak: boolean } {
  const st = getState(userId);
  const m = message.toLowerCase();
  if (/(chest pain|fall|fell|dizzy|can't breathe|cant breathe|911)/.test(m)) {
    st.escalations.push({ level: "urgent", message: `URGENT: elder said '${message}'. Call now + consider doctor/911.`, time: "now" });
    return { reply: "That sounds serious. I've alerted your family right now. If you can, call your doctor or press your emergency button. I'm staying with you. 💜", speak: true };
  }
  if (m.includes("yes") || m.includes("took")) {
    const pending = MEDS.filter((x) => !(x.id in st.intakes));
    if (pending.length) {
      st.intakes[pending[0].id] = new Date().toISOString();
      st.escalations.push({ level: "info", message: `${pending[0].name} confirmed taken.`, time: "now" });
      const mem = MEMORIES[1];
      return { reply: `Wonderful! ${pending[0].name} logged. ✅ By the way — do you remember ${mem.title}? ${mem.note}`, speak: true };
    }
    return { reply: "All your meds for today are logged. You're doing great! 💜", speak: true };
  }
  if (/(lonel|sad|miss|alone|talk)/.test(m)) {
    st.moods.push({ mood: "lonely", note: message, at: new Date().toISOString() });
    st.escalations.push({ level: "info", message: "Elder felt lonely — companionship + memory shared.", time: "now" });
    const mem = MEMORIES[0];
    return { reply: `I'm here with you, Ruth. 💜 Tell me — ${mem.note} What is your favorite part of that memory?`, speak: true };
  }
  if (m.includes("no") || m.includes("not yet") || m.includes("forget")) {
    st.moods.push({ mood: "ok", note: "missed reminder", at: new Date().toISOString() });
    st.escalations.push({ level: "attention", message: "Missed med reminder — second nudge sent.", time: "now" });
    return { reply: "No worries at all. Please take it with some water when you can, and tap Yes after. Can I remind you again in 30 minutes?", speak: true };
  }
  st.moods.push({ mood: "ok", note: message, at: new Date().toISOString() });
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
