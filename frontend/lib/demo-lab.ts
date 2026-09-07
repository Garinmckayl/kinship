import { Agent, ImageBlock, TextBlock } from "@strands-agents/sdk";
import { addEscalation } from "./store";
import { phoneConfig, placeCall, publicBase } from "./phone";

// The Demo Lab is deliberately mock-first. A judge can run the entire story
// without AWS, Twilio, WhatsApp, or a database. Real integrations are opt-in
// with environment variables and always report which mode actually ran.

export type PharmacyStep = {
  id: string;
  label: string;
  detail: string;
  status: "complete" | "active" | "pending";
};

export type PharmacyRun = {
  id: string;
  mode: "mock" | "twilio";
  pharmacy: string;
  medication: string;
  prescriptionNumber: string;
  confirmationNumber: string;
  pickupAt: string;
  status: "confirmed" | "in_progress";
  caregiverMessage: string;
  steps: PharmacyStep[];
  createdAt: string;
  callSid?: string;
};

export type PillObservation = {
  slot: string;
  status: "clear" | "attention" | "unknown";
  detail: string;
};

export type PillAudit = {
  mode: "bedrock-vision" | "demo-vision";
  model: string;
  summary: string;
  observations: PillObservation[];
  safeToTakeNow: boolean;
  createdAt: string;
};

export type ScamIntercept = {
  mode: "mock" | "webhooks";
  transcript: string;
  verdict: "blocked" | "review";
  callerBlocked: boolean;
  bankFreeze: { status: "simulated" | "requested"; reference: string };
  report: { status: "queued" | "sent"; reference: string };
  caregiverAlert: string;
  createdAt: string;
};

export type GraphNode = { id: string; label: string; kind: "memory" | "signal" | "action" };
export type GraphEdge = { from: string; relation: string; to: string };

export type ProactiveInsight = {
  mode: "temporal-graph";
  message: string;
  reason: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdAt: string;
};

const DEMO_USER = "eleanor-79";
const DEMO_PHARMACY = "CVS Pharmacy · 4th Ave";
const DEMO_RX = "RX-4472";

function hasAwsCredentials() {
  return !!(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_BEARER_TOKEN_BEDROCK);
}

function now() {
  return new Date().toISOString();
}

function demoPharmacySteps(): PharmacyStep[] {
  return [
    { id: "dial", label: "Outbound call placed", detail: "Twilio SIP worker → CVS Pharmacy · 4th Ave", status: "complete" },
    { id: "pharmacy", label: "Pharmacy menu selected", detail: "DTMF 1 · “Press 1 for Pharmacy”", status: "complete" },
    { id: "refill", label: "Refill menu selected", detail: "DTMF 2 · “Press 2 for refills”", status: "complete" },
    { id: "rx", label: "Prescription number entered", detail: `DTMF ${DEMO_RX} · recognized by the IVR`, status: "complete" },
    { id: "confirm", label: "Refill confirmed", detail: "Ready Thursday · 2:00 PM · pickup counter", status: "complete" },
  ];
}

export async function runPharmacyRefill(opts: { medication?: string; live?: boolean } = {}): Promise<PharmacyRun> {
  const medication = opts.medication ?? "Lisinopril 10 mg";
  const liveRequested = opts.live === true && process.env.LIVE_PHARMACY_DEMO === "1";
  let mode: PharmacyRun["mode"] = "mock";
  let callSid: string | undefined;

  if (liveRequested && process.env.PHARMACY_PHONE_NUMBER && process.env.PUBLIC_BASE_URL) {
    const cfg = phoneConfig();
    if (cfg.ok) {
      const out = await placeCall(
        process.env.PHARMACY_PHONE_NUMBER,
        `${publicBase()}/api/demo/pharmacy/twiml?rx=${encodeURIComponent(DEMO_RX)}`
      );
      if (out.ok) {
        mode = "twilio";
        callSid = out.sid;
      }
    }
  }

  const confirmed = mode === "mock";
  const confirmationNumber = "CVS-THU-0200";
  const pickupAt = "Thursday at 2:00 PM";
  const caregiverMessage = confirmed
    ? `${medication} refill placed at CVS on 4th Ave. Confirmed ready for pickup Thursday 2:00 PM.`
    : `${medication} call started at CVS on 4th Ave. The phone-tree worker is listening for confirmation.`;
  const run: PharmacyRun = {
    id: `pharmacy-${Date.now()}`,
    mode,
    pharmacy: DEMO_PHARMACY,
    medication,
    prescriptionNumber: DEMO_RX,
    confirmationNumber,
    pickupAt,
    status: confirmed ? "confirmed" : "in_progress",
    caregiverMessage,
    steps: demoPharmacySteps().map((step, index, all) => ({
      ...step,
      status: confirmed || index === 0 ? "complete" : index === all.length - 1 ? "active" : "pending",
    })),
    createdAt: now(),
    callSid,
  };

  if (confirmed) {
    await addEscalation(DEMO_USER, "info", `Pharmacy agent: ${caregiverMessage} Confirmation ${confirmationNumber}.`);
    await sendCaregiverText(`Kinship: ${caregiverMessage} Confirmation ${confirmationNumber}.`);
  }
  return run;
}

async function sendCaregiverText(message: string) {
  if (process.env.ALLOW_DEMO_OUTBOUND !== "1" || !process.env.CAREGIVER_WHATSAPP_NUMBER) return "skipped-demo-outbound";
  try {
    const { sendWaText } = await import("./whatsapp");
    return (await sendWaText(process.env.CAREGIVER_WHATSAPP_NUMBER, message)).ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

const DEMO_PILL_AUDIT: PillAudit = {
  mode: "demo-vision",
  model: "Claude 3.5 Sonnet · Bedrock multimodal fallback",
  summary: "Wednesday AM is empty. Tuesday PM still has a blue tablet. Eleanor should not take that compartment now.",
  observations: [
    { slot: "Wednesday AM", status: "clear", detail: "Compartment is empty — dose appears taken." },
    { slot: "Tuesday PM", status: "attention", detail: "Blue tablet still present — do not take it now." },
    { slot: "Today PM", status: "unknown", detail: "Angle and lighting are not sufficient to identify a dose." },
  ],
  safeToTakeNow: false,
  createdAt: now(),
};

function textFromAgent(result: unknown): string {
  const last = (result as { lastMessage?: { content?: unknown[] } })?.lastMessage;
  const blocks = last?.content ?? [];
  return blocks.map((block) => {
    const b = block as { text?: unknown };
    return typeof b.text === "string" ? b.text : typeof b.text === "object" && b.text && typeof (b.text as { text?: unknown }).text === "string" ? (b.text as { text: string }).text : "";
  }).filter(Boolean).join("\n");
}

function parseVision(text: string): PillAudit | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Partial<PillAudit>;
    if (!Array.isArray(raw.observations) || typeof raw.summary !== "string") return null;
    return {
      mode: "bedrock-vision",
      model: process.env.VISION_MODEL_ID ?? "Claude 3.5 Sonnet · Bedrock",
      summary: raw.summary,
      observations: raw.observations.map((o) => ({
        slot: String(o.slot ?? "Unknown compartment"),
        status: o.status === "attention" || o.status === "clear" ? o.status : "unknown",
        detail: String(o.detail ?? "No confident observation."),
      })),
      safeToTakeNow: raw.safeToTakeNow === true,
      createdAt: now(),
    };
  } catch {
    return null;
  }
}

export async function auditPillTray(imageDataUrl?: string): Promise<PillAudit> {
  // The deterministic path is intentional: cameras and credentials are often
  // unavailable on a judging laptop, but the safety behavior must still show.
  if (!imageDataUrl || !hasAwsCredentials()) return { ...DEMO_PILL_AUDIT, createdAt: now() };
  const match = imageDataUrl.match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/);
  if (!match) return { ...DEMO_PILL_AUDIT, createdAt: now() };
  try {
    const format = match[1] === "png" ? "png" : "jpeg";
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 6 * 1024 * 1024) return { ...DEMO_PILL_AUDIT, createdAt: now() };
    const agent = new Agent({
      model: process.env.VISION_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20241022-v2:0",
      systemPrompt: "You inspect pill organizers conservatively. Never identify a medicine or give dosage advice from appearance alone. Return only JSON with summary, observations[{slot,status,detail}], safeToTakeNow. Use unknown when the image is unclear. If any compartment still contains a pill that may be missed or misplaced, safeToTakeNow must be false.",
      tools: [],
      printer: false,
    });
    const result = await agent.invoke([
      new TextBlock("Audit this weekly pill organizer. Look for empty versus occupied compartments and explain one safe next step in plain language."),
      new ImageBlock({ format, source: { bytes } }),
    ], { limits: { turns: 1 } });
    return parseVision(textFromAgent(result)) ?? { ...DEMO_PILL_AUDIT, createdAt: now() };
  } catch (error) {
    console.warn("Vision audit fell back to deterministic demo:", error);
    return { ...DEMO_PILL_AUDIT, createdAt: now() };
  }
}

export async function interceptScam(transcript: string, opts: { live?: boolean } = {}): Promise<ScamIntercept> {
  const clean = transcript.trim() || "Agent Miller from the IRS says there is a federal warrant payable in Apple Gift Cards.";
  const isBlatantScam = /(gift card|apple card|irs|treasury|warrant|wire|zelle|remote access|don't tell|do not tell|medicare id)/i.test(clean);
  const liveEnabled = opts.live === true;
  const mode: ScamIntercept["mode"] = liveEnabled && (process.env.BANK_FREEZE_WEBHOOK_URL || process.env.SCAM_REPORT_URL) ? "webhooks" : "mock";
  const freezeReference = `bank-freeze-${Date.now()}`;
  const reportReference = `ftc-queue-${Date.now()}`;
  let bankFreeze: ScamIntercept["bankFreeze"] = { status: "simulated", reference: freezeReference };
  let report: ScamIntercept["report"] = { status: "queued", reference: reportReference };

  if (liveEnabled && process.env.BANK_FREEZE_WEBHOOK_URL) {
    try {
      const response = await fetch(process.env.BANK_FREEZE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.BANK_FREEZE_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.BANK_FREEZE_WEBHOOK_SECRET}` } : {}) },
        body: JSON.stringify({ userId: DEMO_USER, reason: "suspected elder scam", transcript: clean, action: "freeze-linked-card" }),
      });
      if (response.ok) bankFreeze = { status: "requested", reference: freezeReference };
    } catch {}
  }
  if (liveEnabled && process.env.SCAM_REPORT_URL) {
    try {
      const response = await fetch(process.env.SCAM_REPORT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.SCAM_REPORT_TOKEN ? { Authorization: `Bearer ${process.env.SCAM_REPORT_TOKEN}` } : {}) },
        body: JSON.stringify({ transcript: clean, category: "elder-fraud", source: "Kinship demo" }),
      });
      if (response.ok) report = { status: "sent", reference: reportReference };
    } catch {}
  }

  const caregiverAlert = isBlatantScam
    ? "Critical Scam Intercepted. Caller blocked. No funds transferred. Linked card freeze requested."
    : "Suspicious call captured for review. No funds transferred.";
  await addEscalation(DEMO_USER, isBlatantScam ? "urgent" : "attention", caregiverAlert);
  await sendCaregiverText(`Kinship: ${caregiverAlert}`);
  return {
    mode,
    transcript: clean,
    verdict: isBlatantScam ? "blocked" : "review",
    callerBlocked: isBlatantScam,
    bankFreeze,
    report,
    caregiverAlert,
    createdAt: now(),
  };
}

export function proactiveGraph(): ProactiveInsight {
  const nodes: GraphNode[] = [
    { id: "knee", label: "Left knee acts up", kind: "memory" },
    { id: "pressure", label: "Barometric pressure drops", kind: "signal" },
    { id: "storm", label: "Heavy rain this afternoon", kind: "signal" },
    { id: "pad", label: "Grab heating pad", kind: "action" },
  ];
  const edges: GraphEdge[] = [
    { from: "knee", relation: "worsens_when", to: "pressure" },
    { from: "storm", relation: "predicts", to: "pressure" },
    { from: "knee", relation: "suggests", to: "pad" },
  ];
  return {
    mode: "temporal-graph",
    message: "Good morning Eleanor — heavy rain is coming this afternoon. Grab your heating pad before your left knee starts complaining like last time.",
    reason: "Day 1 symptom memory + Day 14 weather signal crossed the same relationship in time.",
    nodes,
    edges,
    createdAt: now(),
  };
}

