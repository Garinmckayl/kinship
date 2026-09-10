"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentPhase } from "./AgentOrb";
import { voiceMotion } from "./voiceMotion";

export type NovaFaceName =
  | "idle" | "listening" | "speaking" | "thinking" | "concerned" | "joyful"
  | "reassured" | "empathetic" | "surprised" | "proud" | "sleepy"
  | "playful" | "focused" | "grateful" | "encouraging" | "calm";

const EXPRESSIONS: NovaFaceName[] = [
  "idle", "listening", "speaking", "thinking", "concerned", "joyful",
  "reassured", "empathetic", "surprised", "proud", "sleepy", "playful",
  "focused", "grateful", "encouraging", "calm",
];

const PHASE_FACE: Record<AgentPhase, NovaFaceName> = {
  idle: "idle",
  connecting: "thinking",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  asleep: "idle",
};

const MOUTH = ["mouth-closed", "mouth-half", "mouth-wide"] as const;

// Nova: the caregiver Eleanor talks to. Face follows agent phase with
// crossfade; while speaking, her mouth flaps across 3 frames driven by
// live voice energy (~8fps: closed on quiet, wide on loud) plus a subtle
// head bob. This is what makes her look like she's talking.
export function NovaFace({
  phase,
  expression,
  size = 220,
}: {
  phase: AgentPhase;
  expression?: NovaFaceName;
  size?: number;
}) {
  // Keep talking/listening tied to the live phase so an expression never
  // hides the mouth animation or activity cue.
  const face = phase === "speaking" || phase === "listening" ? PHASE_FACE[phase] : expression ?? PHASE_FACE[phase];
  const [mouth, setMouth] = useState<(typeof MOUTH)[number]>("mouth-closed");
  const [blinking, setBlinking] = useState(false);
  const mouthRef = useRef(mouth);
  mouthRef.current = mouth;
  const lastSwap = useRef(0);
  const motionRef = useRef<HTMLDivElement>(null);
  const [dayPart, setDayPart] = useState<"morning" | "day" | "evening">("day");

  useEffect(() => {
    const update = () => {
      const hour = new Date().getHours();
      setDayPart(hour >= 5 && hour < 11 ? "morning" : hour >= 18 || hour < 5 ? "evening" : "day");
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);


  // Preload flap frames so the first swap doesn't flicker.
  useEffect(() => {
    for (const m of [...MOUTH, ...EXPRESSIONS]) {
      const im = new Image();
      im.src = `/nova/${m}.png`;
    }
  }, []);

  // Human faces blink on their own rhythm. Keep it slightly irregular so the
  // companion feels present without looking like a looping GIF.
  useEffect(() => {
    let alive = true;
    let openTimer: ReturnType<typeof setTimeout>;
    let closeTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      openTimer = setTimeout(() => {
        if (!alive) return;
        setBlinking(true);
        closeTimer = setTimeout(() => {
          if (alive) setBlinking(false);
          if (alive) schedule();
        }, 120);
      }, 3200 + Math.random() * 2800);
    };
    schedule();
    return () => { alive = false; clearTimeout(openTimer); clearTimeout(closeTimer); };
  }, [face]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = motionRef.current;
      const l = voiceMotion.level;
      if (face === "speaking") {
        const now = performance.now();
        if (now - lastSwap.current > 125) {
          const next = l < 0.15 ? MOUTH[0] : l < 0.45 ? MOUTH[1] : MOUTH[2];
          if (next !== mouthRef.current) {
            lastSwap.current = now;
            setMouth(next);
          }
        }
      }
      if (el) {
        if (l > 0.02) {
          const s = 1 + l * 0.04;
          const y = -l * 6;
          el.style.transform = `scale(${s.toFixed(3)}) translateY(${y.toFixed(1)}px)`;
        } else {
          el.style.transform = "";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [face]);

  const src = face === "speaking" ? `/nova/${mouth}.png` : `/nova/${face}.png`;

  const statusLabel = phase === "listening" ? "Listening now" : phase === "speaking" ? "Speaking" : phase === "thinking" ? "Thinking" : phase === "connecting" ? "Connecting" : "Here with you";
  const statusVisible = phase !== "idle" && phase !== "asleep";

  return (
    <div
      className={`nova-stage nova-face-${face} nova-phase-${phase} nova-daypart-${dayPart}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Kinship caregiver is ${statusLabel.toLowerCase()}`}
    >
      <div className="nova-halo" aria-hidden="true" />
      <div ref={motionRef} className="nova-motion">
        <img
          key={face}
          src={src}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className={`nova-face-image nova-fade select-none ${blinking ? "nova-blink" : ""}`}
          style={{ width: size, height: size, objectFit: "contain" }}
        />
      </div>
      {statusVisible && (
        <div className="nova-activity" aria-live="polite">
          <span className="nova-activity-dot" aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>
      )}
    </div>
  );
}
