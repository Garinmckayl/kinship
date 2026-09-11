import { lastHeartbeat, addEscalation, listEscalations, unackedUrgentOlderThan } from "./store";

// The life-saving loop: Eleanor going QUIET is the emergency (fall, stroke,
// can't reach a button). Sweep runs every 30 min via Inngest cron.
// Env: WELFARE_QUIET_MINUTES (default 360 = 6h; set 20 for demo video).
// Active window 7am–9pm ET (11:00–01:00 UTC); nights are sleep, not silence.

export function quietMinutes() {
  return Math.max(5, parseInt(process.env.WELFARE_QUIET_MINUTES ?? "360", 10));
}

function inActiveWindow(now = new Date()) {
  const h = now.getUTCHours();
  return h >= 11 || h < 1;
}

async function recentWelfare(minutes: number, elder: string) {
  const list = await listEscalations(elder, 8);
  const cutoff = Date.now() - minutes * 60_000;
  return list.filter((e) => e.message.startsWith("[welfare"));
}

async function notifyCaregiverWA(text: string): Promise<string> {
  const to = process.env.CAREGIVER_WHATSAPP_NUMBER;
  if (!to) return "no-caregiver-number";
  try {
    const { sendWaText } = await import("./whatsapp");
    return (await sendWaText(to, text)).ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function welfareSweep(elder = "eleanor-79") {
  const actions: string[] = [];
  const q = quietMinutes();
  const hb = await lastHeartbeat(elder);

  if (inActiveWindow()) {
    const recent = await recentWelfare(Math.max(30, q / 2), elder);
    if (!hb && recent.length === 0) {
      await addEscalation(elder, "attention", "[welfare] No activity from Eleanor yet today — please check in.");
      actions.push("first-nudge");
      await notifyCaregiverWA("Kinship: no sign of Eleanor yet today. Please check in on her.");
    } else if (hb && hb.minutesAgo > q * 2 && !recent.some((e) => e.message.startsWith("[welfare-critical]"))) {
      const hrs = Math.floor(hb.minutesAgo / 60);
      await addEscalation(elder, "urgent", `[welfare-critical] No sign of Eleanor for ~${hrs}h. Call her now; consider a welfare visit.`);
      actions.push("critical");
      await notifyCaregiverWA(`Kinship URGENT: no sign of Eleanor for ~${hrs}h. Call her now.`);
      // Try her directly with a voice note too.
      try {
        const { waConfig, sendWaVoice } = await import("./whatsapp");
        const { publicBase } = await import("./phone");
        const wa = waConfig();
        if (wa.ok && wa.elder && process.env.PUBLIC_BASE_URL && process.env.ELEVENLABS_API_KEY) {
          const url = `${publicBase()}/api/speak?text=${encodeURIComponent("Eleanor, it's Kinship. Are you there? Please answer me.".slice(0, 300))}`;
          if ((await sendWaVoice(wa.elder, url)).ok) actions.push("voice-ping");
        }
      } catch {}
    } else if (hb && hb.minutesAgo > q && !recent.some((e) => e.message.startsWith("[welfare-silence]"))) {
      const hrs = Math.floor(hb.minutesAgo / 60);
      const mins = hb.minutesAgo % 60;
      await addEscalation(elder, "attention", `[welfare-silence] Eleanor quiet for ${hrs > 0 ? `~${hrs}h` : `${mins} min`}. A call would be wise.`);
      actions.push("silence-nudge");
      await notifyCaregiverWA(`Kinship: Eleanor has been quiet. A quick call would be wise.`);
    } else {
      actions.push("ok");
    }
  } else {
    actions.push("night-quiet-hours");
  }

  // 24/7: unacknowledged urgent/attention older than 30 min get re-fired.
  // An alert nobody confirmed is an alert nobody saw.
  try {
    const stale = await unackedUrgentOlderThan(30, elder);
    for (const s of stale.slice(0, 3)) {
      await notifyCaregiverWA(`Kinship reminder (unconfirmed ${s.level}): ${s.message}`);
      actions.push(`re-fired-${s.id}`);
    }
  } catch {}

  return { actions, quietMinutes: q, lastHeartbeat: hb };
}
