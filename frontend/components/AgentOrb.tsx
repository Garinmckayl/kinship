"use client";
import { ThinkingOrb } from "thinking-orbs";
import type { OrbState } from "thinking-orbs";

export type AgentPhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "asleep";

const PHASE_TO_ORB: Record<AgentPhase, OrbState> = {
  idle: "breathing",
  connecting: "connecting",
  listening: "listening",
  thinking: "solving",
  speaking: "weaving",
  asleep: "shaping",
};

export const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "Here with you",
  connecting: "Reaching out…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  asleep: "Resting",
};

export function AgentOrb({
  phase,
  scale = 1,
  speed,
  dark = true,
}: {
  phase: AgentPhase;
  scale?: number;
  speed?: number;
  dark?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-center overflow-visible"
      style={{ width: 64 * scale, height: 64 * scale }}
    >
      <div style={{ transform: `scale(${scale})`, width: 64, height: 64 }}>
        <ThinkingOrb
          state={PHASE_TO_ORB[phase]}
          size={64}
          theme={dark ? "dark" : "light"}
          speed={speed ?? (phase === "speaking" ? 1.4 : 1)}
          aria-label={`ElderLove is ${PHASE_LABEL[phase]}`}
        />
      </div>
    </div>
  );
}
