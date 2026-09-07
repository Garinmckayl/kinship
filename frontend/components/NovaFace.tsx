"use client";
import type { AgentPhase } from "./AgentOrb";

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
// crossfades on change, breathes at rest, bounces while speaking.
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
  const anim = face === "speaking" ? "nova-speak" : face === "idle" ? "nova-breathe" : undefined;
  return (
    <img
      key={face}
      src={`/nova/${face}.png`}
      alt={`Nova — ${face}`}
      width={size}
      height={size}
      draggable={false}
      className={`nova-fade select-none ${anim ?? ""}`}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
