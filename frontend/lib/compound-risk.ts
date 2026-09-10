import {
  listMeds, takenMedIds, lastMood, listMoods, listSymptoms,
  symptomMentions, lastHeartbeat, listEscalations, refillStatus,
  healthTrends, addEscalation,
} from "./store";
import { quietMinutes } from "./welfare";

// Compound-risk detection: the hero feature.
// Instead of reacting to one alarm, the system gathers every weak signal,
// scores each independently, then evaluates the combination. A missed pill
// alone is a nudge. A missed pill + dizziness + silence + declining mood is
// a potential adverse event that demands immediate escalation.

// --------------- signal types ---------------

export type Signal = {
  id: string;
  label: string;
  severity: "low" | "medium" | "high" | "critical";
  weight: number;   // 1-10
  detail: string;
  source: string;   // which store function / table
};

export type CompoundAssessment = {
  elder: string;
  signals: Signal[];
  totalWeight: number;
  riskLevel: "green" | "yellow" | "orange" | "red";
  reasoning: string;
  action: "none" | "nudge" | "alert" | "urgent" | "critical";
  escalated: boolean;
  at: string;
};

// --------------- signal collectors ---------------

async function collectMedSignals(elder: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  const meds = (await listMeds(elder)).filter((m) => m.active);
  const taken = await takenMedIds(elder);
  const missed = meds.filter((m) => !taken.includes(m.id));
  const now = new Date();
  const hour = now.getHours();

  // Only flag missed meds after their scheduled time
  for (const m of missed) {
    const [mh] = m.time.split(":").map(Number);
    if (hour >= mh + 1) {
      signals.push({
        id: `med-missed-${m.id}`,
        label: `${m.name} ${m.dosage} missed`,
        severity: missed.length >= 2 ? "high" : "medium",
        weight: missed.length >= 2 ? 7 : 4,
        detail: `Scheduled at ${m.time}, now ${hour}:${String(now.getMinutes()).padStart(2, "0")}. ${taken.length}/${meds.length} taken today.`,
        source: "medications/intakes",
      });
    }
  }

  // Low refill supply
  const refills = await refillStatus(elder);
  for (const r of refills.filter((x) => x.low)) {
    signals.push({
      id: `refill-low-${r.id}`,
      label: `${r.name} supply low (${r.pillsLeft} left)`,
      severity: r.pillsLeft <= 3 ? "high" : "medium",
      weight: r.pillsLeft <= 3 ? 5 : 3,
      detail: `${r.daysLeft} days of supply remaining.`,
      source: "medications/pills_left",
    });
  }

  return signals;
}

async function collectSilenceSignals(elder: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  const hb = await lastHeartbeat(elder);
  const q = quietMinutes();

  if (!hb) {
    signals.push({
      id: "silence-no-heartbeat",
      label: "No activity recorded today",
      severity: "high",
      weight: 6,
      detail: "Eleanor has not interacted with Kinship at all today.",
      source: "heartbeats",
    });
  } else if (hb.minutesAgo > q * 2) {
    const hrs = Math.floor(hb.minutesAgo / 60);
    signals.push({
      id: "silence-critical",
      label: `Silent for ${hrs}+ hours`,
      severity: "critical",
      weight: 9,
      detail: `Last interaction was ${hb.minutesAgo} minutes ago. Critical silence threshold (${q * 2} min) exceeded.`,
      source: "heartbeats",
    });
  } else if (hb.minutesAgo > q) {
    signals.push({
      id: "silence-prolonged",
      label: `Unusually quiet (${hb.minutesAgo} min)`,
      severity: "high",
      weight: 6,
      detail: `Last interaction was ${hb.minutesAgo} minutes ago. Quiet threshold (${q} min) exceeded.`,
      source: "heartbeats",
    });
  } else if (hb.minutesAgo > q / 2) {
    signals.push({
      id: "silence-moderate",
      label: `Activity low (${hb.minutesAgo} min since last)`,
      severity: "medium",
      weight: 3,
      detail: `Last interaction ${hb.minutesAgo} minutes ago.`,
      source: "heartbeats",
    });
  }

  return signals;
}

async function collectSymptomSignals(elder: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  const recent = await listSymptoms(elder, 10);
  const today = new Date().toISOString().slice(0, 10);

  // Symptoms reported today
  const todaySymptoms = recent.filter((s) =>
    s.at && String(s.at).slice(0, 10) === today
  );

  const URGENT_KEYWORDS = /chest pain|fall|fell|can't breathe|cant breathe|stroke|unconscious|faint/i;

  for (const s of todaySymptoms) {
    const complaint = String(s.complaint);
    const isUrgent = URGENT_KEYWORDS.test(complaint) || URGENT_KEYWORDS.test(String(s.detail ?? ""));
    const mentions = await symptomMentions(elder, complaint, 7);

    signals.push({
      id: `symptom-${complaint.replace(/\s+/g, "-").toLowerCase()}`,
      label: complaint,
      severity: isUrgent ? "critical" : mentions >= 3 ? "high" : "medium",
      weight: isUrgent ? 10 : mentions >= 3 ? 6 : 4,
      detail: `Reported today. ${mentions} mention(s) in the last 7 days.${isUrgent ? " EMERGENCY KEYWORD DETECTED." : ""}`,
      source: "symptoms",
    });
  }

  return signals;
}

async function collectMoodSignals(elder: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  const mood = await lastMood(elder);
  const moods = await listMoods(elder, 5);

  const concerning = ["lonely", "sad", "anxious", "confused"];
  if (concerning.includes(mood)) {
    const streak = moods.filter((m) => concerning.includes(m.mood)).length;
    signals.push({
      id: `mood-${mood}`,
      label: `Mood: ${mood}`,
      severity: streak >= 3 ? "high" : "medium",
      weight: streak >= 3 ? 5 : 3,
      detail: `Current mood is "${mood}". ${streak} of last ${moods.length} check-ins were concerning.`,
      source: "moods",
    });
  }

  return signals;
}

async function collectEscalationSignals(elder: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  const recent = await listEscalations(elder, 10);

  // Unacknowledged urgent/attention alerts
  const unacked = recent.filter((e) =>
    (e.level === "urgent" || e.level === "attention") && !e.acked
  );

  if (unacked.length >= 2) {
    signals.push({
      id: "escalation-unacked",
      label: `${unacked.length} alerts unacknowledged`,
      severity: unacked.some((e) => e.level === "urgent") ? "high" : "medium",
      weight: unacked.length >= 3 ? 5 : 3,
      detail: `${unacked.length} attention/urgent alerts have not been confirmed by a caregiver.`,
      source: "escalations",
    });
  }

  return signals;
}

async function collectHealthSignals(elder: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  try {
    const trends = await healthTrends(elder);
    const latest = trends.latest as Record<string, { value: number; unit: string; at: string }>;

    // Check for concerning vitals
    if (latest.heart_rate && (latest.heart_rate.value > 100 || latest.heart_rate.value < 50)) {
      signals.push({
        id: "health-hr-abnormal",
        label: `Heart rate ${latest.heart_rate.value > 100 ? "elevated" : "low"} (${latest.heart_rate.value})`,
        severity: "high",
        weight: 6,
        detail: `Heart rate: ${latest.heart_rate.value} bpm. Normal range: 50-100.`,
        source: "health_metrics",
      });
    }

    if (latest.blood_pressure_sys && latest.blood_pressure_sys.value > 160) {
      signals.push({
        id: "health-bp-high",
        label: `Blood pressure elevated (${latest.blood_pressure_sys.value})`,
        severity: "high",
        weight: 6,
        detail: `Systolic BP: ${latest.blood_pressure_sys.value}. Elevated threshold: >160.`,
        source: "health_metrics",
      });
    }

    if (latest.steps) {
      const avg = (trends.weekAvg as Record<string, { avg: number; n: number }>).steps;
      if (avg && latest.steps.value < avg.avg * 0.4 && avg.n >= 3) {
        signals.push({
          id: "health-steps-low",
          label: `Steps far below average (${latest.steps.value} vs ${Math.round(avg.avg)} avg)`,
          severity: "medium",
          weight: 4,
          detail: `Today: ${latest.steps.value} steps. 7-day average: ${Math.round(avg.avg)}.`,
          source: "health_metrics",
        });
      }
    }
  } catch {
    // Health metrics may not be available
  }

  return signals;
}

// --------------- main assessment ---------------

export async function assessCompoundRisk(elder = "eleanor-79", opts: { escalate?: boolean } = {}): Promise<CompoundAssessment> {
  const shouldEscalate = opts.escalate ?? false;
  // Gather all signals in parallel
  const [meds, silence, symptoms, mood, escalations, health] = await Promise.all([
    collectMedSignals(elder),
    collectSilenceSignals(elder),
    collectSymptomSignals(elder),
    collectMoodSignals(elder),
    collectEscalationSignals(elder),
    collectHealthSignals(elder),
  ]);

  const signals = [...meds, ...silence, ...symptoms, ...mood, ...escalations, ...health];
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);

  // Deduplicate by id (in case symptoms overlap)
  const seen = new Set<string>();
  const unique = signals.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  // Determine risk level based on total weight AND signal count
  const criticalSignals = unique.filter((s) => s.severity === "critical");
  const highSignals = unique.filter((s) => s.severity === "high");
  const signalCount = unique.length;

  let riskLevel: CompoundAssessment["riskLevel"];
  let action: CompoundAssessment["action"];

  if (criticalSignals.length > 0) {
    // Any critical signal (emergency keywords, extreme silence) = red
    riskLevel = "red";
    action = "critical";
  } else if (totalWeight >= 20 || (highSignals.length >= 2 && signalCount >= 3)) {
    // High compound weight OR multiple high-severity signals = red
    riskLevel = "red";
    action = "urgent";
  } else if (totalWeight >= 12 || (highSignals.length >= 1 && signalCount >= 2)) {
    // Moderate compound weight = orange
    riskLevel = "orange";
    action = "alert";
  } else if (totalWeight >= 6 || signalCount >= 2) {
    // Low compound weight but multiple signals = yellow
    riskLevel = "yellow";
    action = "nudge";
  } else {
    riskLevel = "green";
    action = "none";
  }

  // Build reasoning string (this is what makes compound-risk explainable)
  const reasoning = buildReasoning(unique, totalWeight, riskLevel);

  // Escalate if needed (only when explicitly requested, not on every poll)
  let escalated = false;
  if (shouldEscalate && (action === "critical" || action === "urgent")) {
    const signalSummary = unique.map((s) => s.label).join(", ");
    await addEscalation(
      elder,
      "urgent",
      `[compound-risk] ${reasoning.split(".")[0]}. Signals: ${signalSummary}`
    );
    escalated = true;

    // WhatsApp notification
    try {
      const to = process.env.CAREGIVER_WHATSAPP_NUMBER;
      if (to) {
        const { sendWaText } = await import("./whatsapp");
        await sendWaText(
          to,
          `ElderLove COMPOUND RISK ALERT:\n${reasoning}\n\nSignals:\n${unique.map((s) => `- ${s.label}: ${s.detail}`).join("\n")}`
        );
      }
    } catch {}

    // Try to reach Eleanor directly
    if (action === "critical") {
      try {
        const { phoneConfig, publicBase, placeCall } = await import("./phone");
        const cfg = phoneConfig();
        if (cfg.ok && cfg.elder && process.env.PUBLIC_BASE_URL) {
          await placeCall(cfg.elder, `${publicBase()}/api/voice/incoming?user_id=${encodeURIComponent(elder)}`);
        }
      } catch {}
    }
  } else if (shouldEscalate && action === "alert") {
    const signalSummary = unique.map((s) => s.label).join(", ");
    await addEscalation(
      elder,
      "attention",
      `[compound-risk] ${reasoning.split(".")[0]}. Signals: ${signalSummary}`
    );
    escalated = true;

    try {
      const to = process.env.CAREGIVER_WHATSAPP_NUMBER;
      if (to) {
        const { sendWaText } = await import("./whatsapp");
        await sendWaText(to, `ElderLove compound risk: ${reasoning}`);
      }
    } catch {}
  }

  return {
    elder,
    signals: unique,
    totalWeight,
    riskLevel,
    reasoning,
    action,
    escalated,
    at: new Date().toISOString(),
  };
}

// --------------- reasoning engine ---------------

function buildReasoning(signals: Signal[], totalWeight: number, level: CompoundAssessment["riskLevel"]): string {
  if (signals.length === 0) {
    return "All clear. No concerning signals detected.";
  }

  const parts: string[] = [];
  const domains = new Set(signals.map((s) => s.source));

  // Opening statement
  if (level === "red") {
    parts.push(`COMPOUND RISK: ${signals.length} signals across ${domains.size} domains combine to an abnormal pattern (weight ${totalWeight}).`);
  } else if (level === "orange") {
    parts.push(`Elevated risk: ${signals.length} signals detected across ${domains.size} domains (weight ${totalWeight}).`);
  } else if (level === "yellow") {
    parts.push(`Mild concern: ${signals.length} signals detected (weight ${totalWeight}).`);
  } else {
    parts.push(`Low risk: ${signals.length} minor signal(s) detected.`);
  }

  // Cross-domain reasoning (the key differentiator)
  const hasMedIssue = signals.some((s) => s.source === "medications/intakes");
  const hasSilence = signals.some((s) => s.source === "heartbeats");
  const hasSymptom = signals.some((s) => s.source === "symptoms");
  const hasMoodIssue = signals.some((s) => s.source === "moods");
  const hasHealthIssue = signals.some((s) => s.source === "health_metrics");
  const hasUnackedAlerts = signals.some((s) => s.source === "escalations");

  if (hasMedIssue && hasSymptom) {
    const symptomLabels = signals.filter((s) => s.source === "symptoms").map((s) => s.label);
    parts.push(`Missed medication combined with reported symptoms (${symptomLabels.join(", ")}) may indicate an adverse reaction or worsening condition.`);
  }

  if (hasMedIssue && hasSilence) {
    parts.push("Medication non-adherence combined with silence is concerning — Eleanor may be unable to respond.");
  }

  if (hasSymptom && hasSilence) {
    parts.push("Symptom report followed by silence suggests a possible incapacitating event.");
  }

  if (hasMoodIssue && hasSilence) {
    parts.push("Declining mood followed by withdrawal may indicate deepening distress.");
  }

  if (hasHealthIssue && hasMedIssue) {
    parts.push("Abnormal vitals combined with missed medication requires clinical attention.");
  }

  if (hasUnackedAlerts && hasSilence) {
    parts.push("Previous alerts went unacknowledged and Eleanor has gone quiet — no one may be monitoring.");
  }

  // Per-signal detail
  if (signals.length <= 6) {
    for (const s of signals) {
      parts.push(`${s.label}: ${s.detail}`);
    }
  }

  return parts.join(" ");
}
