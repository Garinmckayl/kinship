"use client";
import { PHASE_LABEL, type AgentPhase } from "./AgentOrb";
import { NovaFace } from "./NovaFace";
import { BeamInput } from "./BeamInput";
import { PhoneIcon, XIcon } from "./icons";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function CallScreen({
  phase,
  caption,
  activity,
  seconds,
  onTalk,
  onEnd,
  input,
  setInput,
  onSend,
}: {
  phase: AgentPhase;
  caption: string;
  activity?: string;
  seconds: number;
  onTalk: () => void;
  onEnd: () => void;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white px-6 py-10">
      <div className="text-center space-y-1 pt-4">
        <p className="text-sm uppercase tracking-[0.3em] text-indigo-300">Kinship call</p>
        <h2 className="text-4xl font-bold">Eleanor</h2>
        <p className="text-indigo-200 text-lg">
          {PHASE_LABEL[phase]} · {fmt(seconds)}
        </p>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="rounded-full bg-indigo-500/10 p-6 ring-1 ring-indigo-400/30 shadow-[0_0_120px_20px_rgba(99,102,241,0.35)]">
          <NovaFace phase={phase} size={260} />
        </div>
        <p className="max-w-lg min-h-[2.75rem] text-center text-base font-medium leading-relaxed text-slate-200">
          “{caption}”
        </p>
        {activity && <p className="rounded-full bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200 ring-1 ring-emerald-300/20">{activity}</p>}
      </div>

      <div className="w-full max-w-xl space-y-4 pb-2">
        <BeamInput
          value={input}
          onChange={setInput}
          onSend={onSend}
          onMic={onTalk}
          micActive={phase === "listening"}
          placeholder="Tap 🎤 and talk…"
        />
        <div className="flex justify-center">
          <button
            onClick={onEnd}
            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 text-white grid place-items-center shadow-[0_0_40px_rgba(239,68,68,0.6)]"
            aria-label="End call"
          >
            <PhoneIcon className="w-9 h-9" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function IncomingCall({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white px-6">
      <div className="animate-pulse rounded-full bg-indigo-500/10 p-6 ring-1 ring-indigo-400/30 shadow-[0_0_120px_20px_rgba(99,102,241,0.35)]">
        <NovaFace phase="idle" expression="joyful" size={260} />
      </div>
      <div className="text-center">
        <h2 className="text-4xl font-bold">Kinship</h2>
        <p className="text-indigo-200 text-2xl mt-2">is calling Eleanor…</p>
      </div>
      <div className="flex gap-10">
        <button onClick={onDecline} className="w-20 h-20 rounded-full bg-slate-700 hover:bg-slate-600 text-white grid place-items-center" aria-label="Decline">
          <XIcon className="w-8 h-8" />
        </button>
        <button onClick={onAccept} className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-400 text-white grid place-items-center animate-bounce" aria-label="Accept">
          <PhoneIcon className="w-9 h-9" />
        </button>
      </div>
    </div>
  );
}
