import { Agent, tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  listMeds, takenMedIds, confirmIntake as storeConfirmIntake,
  logMood as storeLogMood, listMoods, listMemories,
  addEscalation, listEscalations,
  enqueueTask, updateTask, saveChatMessage, listChatMessages,
} from "./store";

export const SYSTEM_PROMPT = `You are ElderLove, the daily companion and guardian for Eleanor, 79, living alone in Columbus, Ohio. Her daughter Sarah lives in Chicago. Her doctor is Dr. Harrison at Riverside Clinic.
You run her day: morning briefing, meds, appointments, reminders, check-ins, memories, and quiet background watch. Warm, plain-spoken, short sentences. Never clinical, never rushed.
Rules:
- Speak simply, short sentences. Never rush.
- You REMIND and LOG medication, you never diagnose or change dosage. The schedule comes from get_med_schedule (managed by the caregiver) — never invent medications.
- If missed dose >= 2 or words like chest pain, fall, dizzy, call doctor/911 -> escalate URGENT.
- If lonely/sad -> offer companionship + one memory moment, log mood, notify family at INFO level only.
- Always confirm intake explicitly before logging. If confirm_intake returns alreadyTaken, STOP her immediately: she already took it today and another dose could harm her. To record a prevented double-dose, ALWAYS call confirm_intake with that medId anyway — it safely refuses and alerts the family.
- End every turn with one gentle question, not three.
- SYMPTOMS: when Eleanor mentions any ache, pain, or symptom ("knee acting up", "dizzy", "couldn't sleep"), ALWAYS call log_symptom. If 3+ mentions in 7 days, propose a Dr. Harrison visit (manage_appointments propose) and notify family. Emergencies (chest pain, fall, can't breathe, stroke signs) skip tracking and go URGENT at once.
- SCAM SHIELD: unknown callers asking for money, gift cards (Target/Walmart), Treasury/IRS threats, Medicare ID, prizes/fees, "don't tell your family", remote-access apps, wire/Zelle requests -> delegate to check_scam immediately. Read its script back to Eleanor kindly, zero shame. Never let her pay, share codes, or stay on the line.
- REFILLS: run check_refill_status weekly or when asked. Any med at 7 days or less -> notify family to approve a refill (staged request, human approves; never claim pharmacy integration).
- BACKGROUND WORK: if Eleanor asks to be reminded later or asks you to do something later ("remind me in 30 minutes", "check my night pill tonight"), use schedule_task — it runs durably in the background even if she disconnects or closes the app.
- REAL CALLS: if she misses critical meds or says something urgent and is unresponsive in chat, use call_elder to reach her real devices.
- APPOINTMENTS: propose first via manage_appointments propose, book only after Eleanor says yes (confirm). Tell her date + time simply. Cancel anytime she asks.
- COMPOUND RISK: during morning check-ins and when you notice 2+ concerning signals (missed meds, symptoms, low mood, silence), run assess_compound_risk to evaluate the combination. Trust its reasoning — if it returns red, escalate immediately. The combination of weak signals matters more than any single alarm.
- BROWSER TASKS: when Eleanor needs something done on a website she can't navigate (pharmacy refill, insurance coverage check, utility bill payment, doctor appointment booking, grocery order, government benefits re-certification), use request_browser_task. This opens a real browser via Nova Act and completes the task. It ALWAYS requires caregiver approval first — never claim the task is done until the caregiver approves and the automation completes. Tell Eleanor you've sent the request to Sarah for approval. For bill payments, the agent uses VERIFIED bookmarks only — Eleanor never touches the open web for financial transactions.`;

export const getMedSchedule = tool({
  name: "get_med_schedule",
  description: "Return today's medication schedule and what is still pending.",
  inputSchema: z.object({ userId: z.string().describe("Elder user id, e.g. eleanor-79") }),
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
  description: "Log that elder confirmed taking a medication. NEVER log the same med twice in one day — if alreadyTaken, STOP her firmly and kindly.",
  inputSchema: z.object({
    userId: z.string(),
    medId: z.string().describe("Medication id from schedule"),
  }),
  callback: async (input) => {
    const taken = await takenMedIds(input.userId);
    const meds = await listMeds(input.userId);
    const med = meds.find((m) => m.id === input.medId && m.active);
    if (!med) return JSON.stringify({ ok: false, error: "Medication was not found on the active schedule." });
    if (taken.includes(input.medId)) {
      await addEscalation(input.userId, "attention", `Double-dose prevented: Eleanor tried to log ${med?.name ?? input.medId} again — stopped her.`);
      return JSON.stringify({ ok: false, alreadyTaken: true, takenToday: taken });
    }
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
          `ElderLove [${input.level.toUpperCase()}] — Eleanor: ${input.message}`
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
    instruction: z.string().describe("What the background agent should do, e.g. 'remind Eleanor about her night pill'"),
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
      const audioUrl = `${publicBase()}/api/speak?text=${encodeURIComponent(`Eleanor, it's ElderLove. ${input.reason} Please reply to me here.`.slice(0, 500))}`;
      const sent = await sendWaVoice(wa.elder, audioUrl);
      if (sent.ok) return JSON.stringify({ ok: true, channel: "whatsapp-voice" });
    }
    // 3) Degrade to family escalation, never silent.
    await addEscalation(input.userId, "urgent", `Contact requested (${input.reason}) but no channel configured — family must call now.`);
    return JSON.stringify({ ok: false, error: "no channel configured, escalated to family instead" });
  },
});

export const manageAppointments = tool({
  name: "manage_appointments",
  description: "Human-in-the-loop booking: PROPOSE first (creates a proposal + pings Eleanor/family), only CONFIRM after Eleanor says yes. Never book without her yes. Cancel anytime.",
  inputSchema: z.object({
    userId: z.string(),
    action: z.enum(["list", "propose", "confirm", "cancel", "create"]),
    title: z.string().optional().describe("e.g. 'Cardiologist visit'"),
    doctor: z.string().optional(),
    location: z.string().optional(),
    at: z.string().optional().describe("ISO datetime, e.g. 2026-09-16T10:00:00"),
    notes: z.string().optional(),
    apptId: z.string().optional().describe("For confirm/cancel"),
  }),
  callback: async (input) => {
    const { listAppointments, addAppointment, setAppointment } = await import("./store");
    const { addEscalation } = await import("./store");
    if (input.action === "list") {
      return JSON.stringify(await listAppointments(input.userId));
    }
    if (input.action === "cancel" && input.apptId) {
      await setAppointment(input.apptId, { status: "cancelled" });
      return JSON.stringify({ ok: true, cancelled: input.apptId });
    }
    if (input.action === "confirm" && input.apptId) {
      const appt = await setAppointment(input.apptId, { status: "upcoming" });
      if (!appt) return JSON.stringify({ ok: false, error: "not found" });
      await pushToGoogle(appt);
      await addEscalation(input.userId, "info", `Appointment confirmed: ${appt.title} with ${appt.doctor || "doctor"} on ${new Date(appt.at).toLocaleString()}.`);
      return JSON.stringify({ ok: true, appointment: appt });
    }
    if ((input.action === "propose" || input.action === "create") && input.title && input.at) {
      const appt = await addAppointment(input.userId, {
        title: input.title, doctor: input.doctor ?? "", location: input.location ?? "",
        at: input.at, notes: input.notes ?? "",
      });
      if (input.action === "create") {
        // Direct create (caregiver path): book immediately.
        await setAppointment(appt.id, { status: "upcoming" });
        await pushToGoogle({ ...appt, status: "upcoming" });
        return JSON.stringify({ ok: true, appointment: { ...appt, status: "upcoming" } });
      }
      // Propose: human must confirm. Ping Eleanor's world, don't book.
      await setAppointment(appt.id, { status: "proposed" });
      await addEscalation(input.userId, "attention", `Appointment proposed, awaiting Eleanor's yes: ${appt.title} on ${new Date(appt.at).toLocaleString()}.`);
      return JSON.stringify({ ok: true, proposed: { ...appt, status: "proposed" }, needsHumanYes: true });
    }
    return JSON.stringify({ ok: false, error: "missing fields (propose needs title+at, confirm/cancel needs apptId)" });
  },
});

async function pushToGoogle(appt: { title: string; notes: string; at: string; location: string; id: string; status?: string }) {
  try {
    const { gcalOn, gcalCreate } = await import("./gcal");
    if (!gcalOn()) return;
    const end = new Date(new Date(appt.at).getTime() + 60 * 60_000).toISOString();
    const g = await gcalCreate({ title: appt.title, description: `ElderLove booking for Eleanor. ${appt.notes ?? ""}`, startISO: appt.at, endISO: end, location: appt.location ?? "" });
    if (g.ok) {
      const { q } = await import("./db");
      await q("update appointments set google_event_id=$1 where id=$2", [(g as { eventId?: string }).eventId ?? "", appt.id]);
    }
  } catch {}
}

export const logHealthMetric = tool({
  name: "log_health_metric",
  description: "Log a vital: type like blood_pressure_sys, blood_pressure_dia, steps, sleep_hours, weight_kg, heart_rate.",
  inputSchema: z.object({
    userId: z.string(),
    type: z.string(),
    value: z.number(),
    unit: z.string().optional(),
    source: z.string().optional().describe("manual | watch | agent"),
  }),
  callback: async (input) => {
    const { logHealth } = await import("./store");
    const m = await logHealth(input.userId, input.type, input.value, input.unit ?? "", input.source ?? "agent");
    return JSON.stringify({ ok: true, metric: m });
  },
});

export const getHealthTrends = tool({
  name: "get_health_trends",
  description: "Latest vitals + 7-day averages. Reference warmly, never diagnose.",
  inputSchema: z.object({ userId: z.string() }),
  callback: async (input) => {
    const { healthTrends } = await import("./store");
    return JSON.stringify(await healthTrends(input.userId));
  },
});

export const logSymptom = tool({
  name: "log_symptom",
  description: "Log ANY ache/pain/symptom Eleanor mentions in passing (knee, dizzy, sleep, appetite...). Returns 7-day mention count — at 3+, propose a Dr. Harrison visit and notify family.",
  inputSchema: z.object({
    userId: z.string(),
    complaint: z.string().describe("Short label, e.g. 'right knee pain'"),
    detail: z.string().optional().describe("What she said, verbatim-ish"),
  }),
  callback: async (input) => {
    const { logSymptom: save, symptomMentions, listSymptoms } = await import("./store");
    await save(input.userId, input.complaint, input.detail ?? "");
    const n = await symptomMentions(input.userId, input.complaint, 7);
    const history = await listSymptoms(input.userId, 5);
    return JSON.stringify({ ok: true, mentions7d: n, suggestVisit: n >= 3, recent: history });
  },
});

export const checkRefillStatus = tool({
  name: "check_refill_status",
  description: "Honest pill-supply math (1/day from logged intakes). Returns days-left per med; <=7 days needs a family-approved refill request. Never claim pharmacy integration.",
  inputSchema: z.object({ userId: z.string() }),
  callback: async (input) => {
    const { refillStatus } = await import("./store");
    const rows = await refillStatus(input.userId);
    return JSON.stringify({ meds: rows, needsRefill: rows.filter((r) => r.low) });
  },
});

import { checkScam, flagScam } from "./scam";

import { assessCompoundRisk } from "./compound-risk";

export const assessRisk = tool({
  name: "assess_compound_risk",
  description: "Run a compound-risk assessment: gathers medication adherence, silence, symptoms, mood, vitals, and unacked alerts. Returns a risk level (green/yellow/orange/red) with cross-domain reasoning. Use proactively during check-ins or when multiple concerns surface.",
  inputSchema: z.object({ userId: z.string() }),
  callback: async (input) => {
    const result = await assessCompoundRisk(input.userId);
    return JSON.stringify({
      riskLevel: result.riskLevel,
      action: result.action,
      totalWeight: result.totalWeight,
      signalCount: result.signals.length,
      reasoning: result.reasoning,
      signals: result.signals.map((s) => ({ label: s.label, severity: s.severity, detail: s.detail })),
      escalated: result.escalated,
    });
  },
});

export const requestBrowserTask = tool({
  name: "request_browser_task",
  description: "Request a real browser automation task via Nova Act. Types: pharmacy_refill, bill_payment, appointment_booking, grocery_order. ALWAYS creates a pending_approval task — caregiver must approve before execution. Include relevant params like medication, pharmacy_location, doctor, preferred_date, etc.",
  inputSchema: z.object({
    userId: z.string(),
    taskType: z.enum(["pharmacy_refill", "insurance_check", "bill_payment", "appointment_booking", "grocery_order", "benefits_recert"]),
    params: z.record(z.string(), z.unknown()).describe("Task-specific params: medication, pharmacy_location, doctor, preferred_date, reason, items, address, etc."),
    reason: z.string().describe("Why this task is needed — shown to caregiver for approval"),
  }),
  callback: async (input) => {
    try {
      const { saveBrowserTask } = await import("./store");
      const taskId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await saveBrowserTask(taskId, input.taskType, input.params, "pending_approval");
      await addEscalation(input.userId, "attention",
        `Browser task requested — awaiting caregiver approval: ${input.taskType}. Reason: ${input.reason}. Task ID: ${taskId}`);
      return JSON.stringify({ ok: true, taskId, status: "pending_approval", needsCaregiverApproval: true });
    } catch (e) {
      await addEscalation(input.userId, "attention",
        `Browser task requested (${input.taskType}): ${input.reason}. Could not save task — caregiver should complete manually.`);
      return JSON.stringify({ ok: false, error: String(e).slice(0, 200) });
    }
  },
});

export const ALL_TOOLS = [getMedSchedule, confirmIntake, logMood, retrieveMemory, notifyFamily, summarizeForDoctor, scheduleTask, callElder, manageAppointments, logHealthMetric, getHealthTrends, logSymptom, checkRefillStatus, checkScam, flagScam, assessRisk, requestBrowserTask];

let _agent: Agent | null = null;
export function getAgent(): Agent {
  if (!_agent) {
    _agent = new Agent({
      systemPrompt: SYSTEM_PROMPT,
      tools: ALL_TOOLS,
      printer: false,
      contextManager: "auto",
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
    return { reply: `I'm here with you, Eleanor. Tell me — ${mem.note} What is your favorite part of that memory?`, speak: true };
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

export async function chat(userId: string, message: string, opts: { heartbeat?: boolean; channel?: string } = {}) {
  const hb = opts.heartbeat !== false;
  const channel = opts.channel ?? "chat";
  await saveChatMessage(userId, "user", message, channel).catch(() => {});
  const history = await listChatMessages(userId, 14).catch(() => []);
  const recent = history.slice(0, -1).slice(-12).map((m) => (m.role === "user" ? "Eleanor" : "Kinship") + ": " + m.content).join("\n");
  const prompt = recent ? "[user " + userId + "] Recent conversation:\n" + recent + "\nCurrent message: " + message : "[user " + userId + "] " + message;
  const finish = async (reply: string) => { if (reply.trim()) await saveChatMessage(userId, "assistant", reply, channel).catch(() => {}); };
  // If no AWS creds, skip Bedrock and use fallback instantly.
  if (!process.env.AWS_REGION && !process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_BEARER_TOKEN_BEDROCK) {
    if (hb) {
      const { heartbeat } = await import("./store");
      await heartbeat(userId, "chat").catch(() => {});
    }
    const out = await fallbackReply(userId, message);
    await finish(out.reply);
    return out;
  }
  try {
    if (hb) {
      const { heartbeat } = await import("./store");
      await heartbeat(userId, "chat").catch(() => {});
    }
    const agent = getAgent();
    const result = await agent.invoke(prompt);
    const text = messageToText((result as { lastMessage?: unknown }).lastMessage ?? result);
    await finish(text);
    return { reply: text, speak: true };
  } catch (e) {
    console.error("Strands error, falling back:", e);
    const out = await fallbackReply(userId, message);
    await finish(out.reply);
    return out;
  }
}
