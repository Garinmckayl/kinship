import { Agent, tool } from "@strands-agents/sdk";
import { z } from "zod";
import { addEscalation } from "./store";

// ScamGuard: fraud-specialist sub-agent. The guardian delegates suspicious
// money/caller stories here instead of judging them inline.
const SCAM_PROMPT = `You are Kinship ScamGuard, a fraud specialist protecting Eleanor, 79, in Columbus, Ohio.
Common senior scams: gift cards (Target/Walmart) to "pay" debts; Treasury/IRS arrest threats;
Medicare ID "verification"; fake prizes with fees; utility shutoff threats; "grandchild in jail, wire money";
"don't tell your family"; remote-access apps (AnyDesk/TeamViewer); Zelle/cash-app strangers.
Reply with ONLY this JSON, no other text:
{"scam": true|false, "confidence": "high|medium|low", "kind": "<short label or null>",
"script": "<exactly what to tell Eleanor in 2 short kind sentences>",
"familyNote": "<one line for daughter Sarah>"}
Never shame Eleanor. Caution beats certainty: unknown caller + money pressure = scam until proven otherwise.`;

let _scam: Agent | null = null;
export function getScamAgent(): Agent {
  if (!_scam) {
    _scam = new Agent({ systemPrompt: SCAM_PROMPT, tools: [], printer: false, contextManager: "auto" });
  }
  return _scam;
}

export type ScamVerdict = { scam: boolean; confidence: string; kind: string | null; script: string; familyNote: string };

export async function scamVerdict(transcript: string): Promise<ScamVerdict> {
  const fallback: ScamVerdict = {
    scam: true, confidence: "medium", kind: "unverified caller",
    script: "Please don't pay or share anything until Sarah checks it with you. Can you tell me exactly what they asked for?",
    familyNote: "Eleanor reported a suspicious caller; specialist unreachable, treat as possible scam.",
  };
  try {
    const r = await getScamAgent().invoke(`Eleanor said: "${transcript}"`);
    const last = (r as { lastMessage?: unknown }).lastMessage as { content?: { text?: string | { text?: string } }[] } | undefined;
    let text = "";
    for (const b of last?.content ?? []) {
      if (typeof b.text === "string") text += b.text;
      else if (typeof b.text?.text === "string") text += b.text.text;
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const v = JSON.parse(m[0]);
    return {
      scam: !!v.scam, confidence: String(v.confidence ?? "low"), kind: v.kind ?? null,
      script: String(v.script ?? fallback.script), familyNote: String(v.familyNote ?? ""),
    };
  } catch {
    return fallback;
  }
}

export const flagScam = tool({
  name: "flag_scam",
  description: "Log a confirmed scam attempt: urgent family alert + WhatsApp. Use after check_scam verdict or blatant scam.",
  inputSchema: z.object({
    userId: z.string(),
    kind: z.string().describe("e.g. gift-card Treasury scam"),
    detail: z.string().describe("What Eleanor reported"),
  }),
  callback: async (input) => {
    await addEscalation(input.userId, "urgent", `SCAM BLOCKED (${input.kind}): ${input.detail} — Eleanor told to hang up, pay nothing. Sarah, call her now.`);
    let whatsapp = "skipped";
    if (process.env.CAREGIVER_WHATSAPP_NUMBER) {
      try {
        const { sendWaText } = await import("./whatsapp");
        whatsapp = (await sendWaText(process.env.CAREGIVER_WHATSAPP_NUMBER, `Kinship SCAM ALERT: Eleanor reported "${input.detail}". Told her to hang up. Call her now.`)).ok ? "sent" : "failed";
      } catch { whatsapp = "failed"; }
    }
    return JSON.stringify({ ok: true, whatsapp });
  },
});

export const checkScam = tool({
  name: "check_scam",
  description: "Delegate ANY suspicious caller/money story to the ScamGuard specialist (gift cards, Treasury/IRS, Medicare ID, prizes, threats, wire requests, 'don't tell family'). Returns verdict + whether family was alerted.",
  inputSchema: z.object({
    userId: z.string(),
    transcript: z.string().describe("What Eleanor said, verbatim"),
  }),
  callback: async (input) => {
    const v = await scamVerdict(input.transcript);
    let action = "none";
    if (v.scam && (v.confidence === "high" || v.confidence === "medium")) {
      await addEscalation(input.userId, "urgent", `SCAM BLOCKED (${v.kind ?? "unknown"}): ${input.transcript} — Eleanor told to hang up, pay nothing. Sarah, call her now.`);
      action = "urgent-alert-sent";
      if (process.env.CAREGIVER_WHATSAPP_NUMBER) {
        try {
          const { sendWaText } = await import("./whatsapp");
          if ((await sendWaText(process.env.CAREGIVER_WHATSAPP_NUMBER, `Kinship SCAM ALERT: ${v.familyNote || input.transcript}. Told Eleanor to hang up. Call her now.`)).ok) action = "urgent-alert-sent+whatsapp";
        } catch {}
      }
    }
    return JSON.stringify({ ...v, actionTaken: action, sayToEleanorFirst: v.script });
  },
});
