"use client";
import { useEffect, useRef } from "react";
import type { AgentPhase } from "./AgentOrb";
import { voiceMotion } from "./voiceMotion";

export type NovaFaceName = "idle" | "listening" | "speaking" | "thinking" | "concerned" | "joyful";

const PHASE_FACE: Record<AgentPhase, NovaFaceName> = {
  idle: "idle",
  connecting: "thinking",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  asleep: "idle",
};

// Nova: the caregiver Eleanor talks to. Face follows agent phase,
// crossfades on change, breathes at rest, and moves with her real
// voice energy (analyser-driven bob, not a static swap).
export function NovaFace({
  phase,
  expression,
  size = 220,
}: {
  phase: AgentPhase;
  expression?: NovaFaceName;
  size?: number;
}) {
  const face = expression ?? PHASE_FACE[phase];
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = imgRef.current;
      if (el) {
        const l = voiceMotion.level;
        if (l > 0.02) {
          const s = 1 + l * 0.05;
          const y = -l * 7;
          const tilt = Math.sin(performance.now() / 140) * l * 1.2;
          el.style.transform = `scale(${s.toFixed(3)}) translateY(${y.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)`;
        } else {
          el.style.transform = "";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <img
      key={face}
      ref={imgRef}
      src={`/nova/${face}.png`}
      alt={`Nova — ${face}`}
      width={size}
      height={size}
      draggable={false}
      className={`nova-fade select-none ${face === "idle" ? "nova-breathe" : ""}`}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
