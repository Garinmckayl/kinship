"use client";
import { BorderBeam } from "border-beam";

export function BeamInput({
  value,
  onChange,
  onSend,
  onMic,
  micActive,
  placeholder = "Talk or type…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  micActive?: boolean;
  placeholder?: string;
}) {
  return (
    <BorderBeam size="md" colorVariant="ocean" theme="dark">
      <div className="flex items-center gap-2 bg-slate-950/90 rounded-2xl pl-2 pr-2 py-2">
        <button
          onClick={onMic}
          aria-label="Speak"
          className={`w-12 h-12 shrink-0 rounded-xl text-2xl transition ${
            micActive ? "bg-red-500 animate-pulse" : "bg-indigo-600 hover:bg-indigo-500"
          }`}
        >
          🎤
        </button>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent outline-none text-white text-xl placeholder:text-slate-500 px-2"
        />
        <button
          onClick={onSend}
          aria-label="Send"
          className="px-5 h-12 shrink-0 rounded-xl bg-white text-slate-950 text-xl font-bold hover:bg-indigo-100"
        >
          ↑
        </button>
      </div>
    </BorderBeam>
  );
}
