"use client";
import { useEffect, useRef, useState } from "react";
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
  const face = expression ?? PHASE_FACE[phase];
  const [mouth, setMouth] = useState<(typeof MOUTH)[number]>("mouth-closed");
  const mouthRef = useRef(mouth);
  mouthRef.current = mouth;
  const lastSwap = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // Preload flap frames so the first swap doesn't flicker.
  useEffect(() => {
    for (const m of MOUTH) {
      const im = new Image();
      im.src = `/nova/${m}.png`;
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = imgRef.current;
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

  return (
    <img
      key={face}
      ref={imgRef}
      src={src}
      alt={`Nova — ${face}`}
      width={size}
      height={size}
      draggable={false}
      className={`nova-fade select-none ${face === "idle" ? "nova-breathe" : ""}`}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
