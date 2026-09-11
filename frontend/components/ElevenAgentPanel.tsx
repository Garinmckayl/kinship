"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { PHASE_LABEL, type AgentPhase } from "./AgentOrb";
import { NovaFace, type NovaFaceName } from "./NovaFace";
import { PhoneIcon, XIcon } from "./icons";

type LiveRole = "agent" | "elder";

type Props = {
  elderName?: string;
  dynamicContext?: Record<string, string | number | boolean>;
  onMessage: (role: LiveRole, text: string) => void;
  onPhase?: (phase: "idle" | "connecting" | "listening" | "speaking") => void;
  onTool?: (name: string) => void;
  caption?: string;
  expression?: NovaFaceName;
};

function fmt(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function AgentControls({ elderName, dynamicContext, onMessage, onPhase, onTool, caption, expression }: Props) {
  const conversation = useConversation();
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [immersive, setImmersive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const wasConnected = useRef(false);
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const livePhase: AgentPhase = conversation.status === "connecting" ? "connecting" : conversation.isSpeaking ? "speaking" : conversation.status === "connected" ? "listening" : "idle";

  useEffect(() => {
    if (conversation.status === "connected") wasConnected.current = true;
    if (wasConnected.current && conversation.status === "disconnected") {
      setImmersive(false);
      wasConnected.current = false;
    }
  }, [conversation.status]);

  useEffect(() => {
    if (!immersive) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [immersive]);

  const start = async () => {
    if (!agentId) {
      setNotice("Add NEXT_PUBLIC_ELEVENLABS_AGENT_ID to turn on the live agent. Browser voice fallback is still available.");
      return;
    }
    setNotice("");
    setSeconds(0);
    setImmersive(true);
    onPhase?.("connecting");
    try {
      await conversation.startSession({
        agentId,
        userId: "eleanor-79",
        dynamicVariables: {
          elder_name: elderName ?? "Eleanor",
          user_id: "eleanor-79",
          current_time: new Date().toLocaleString(),
          ...dynamicContext,
        },
      });
    } catch {
      setImmersive(false);
      onPhase?.("idle");
      setNotice("The live voice session could not start. Please try again.");
    }
  };

  const end = () => {
    conversation.endSession();
    setImmersive(false);
    wasConnected.current = false;
    onPhase?.("idle");
  };

  const sendText = () => {
    const value = text.trim();
    if (!value || conversation.status !== "connected") return;
    conversation.sendUserMessage(value);
    setText("");
  };

  const statusText = conversation.status === "connected"
    ? conversation.isSpeaking ? "Kinship is speaking — interrupt anytime" : "I’m listening"
    : conversation.status === "connecting" ? "Opening our conversation…" : "Ready for a live conversation";

  return (
    <>
      <div className="live-voice-card relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-fuchsia-500/10 p-5 shadow-[0_18px_70px_rgba(34,211,238,0.12)] ring-1 ring-white/10">
        <div className="absolute -right-14 -top-16 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${conversation.status === "connected" ? "bg-emerald-300 shadow-[0_0_14px_#6ee7b7]" : "bg-cyan-300"}`} /><p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Live companion voice</p></div>
            <p className="mt-2 text-lg font-bold text-white">A real conversation, not push-to-talk</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-300">Large, distraction-free visuals, natural turn-taking, and expressive responses designed for seniors.</p>
          </div>
          {conversation.status === "connected" ? (
            <button onClick={() => setImmersive(true)} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 hover:bg-cyan-200">Return to full screen</button>
          ) : (
            <button onClick={start} disabled={conversation.status === "connecting"} className="rounded-xl bg-cyan-300 px-5 py-3 text-base font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:-translate-y-0.5 hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60">Start immersive call</button>
          )}
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300"><span className="rounded-full bg-white/10 px-3 py-1.5">{statusText}</span><span className="rounded-full bg-white/10 px-3 py-1.5">Interruptible</span><span className="rounded-full bg-white/10 px-3 py-1.5">Context-aware</span></div>
        {notice && <p className="relative mt-3 rounded-xl bg-amber-300/10 px-3 py-2 text-sm leading-5 text-amber-100 ring-1 ring-amber-300/20">{notice}</p>}
      </div>

      {immersive && (
        <div className={`live-immersive live-phase-${livePhase}`} role="dialog" aria-modal="true" aria-label="Live Kinship conversation">
          <div className="live-ambient live-ambient-one" /><div className="live-ambient live-ambient-two" />
          <header className="live-immersive-header">
            <div><p className="live-kicker"><span className="status-dot" /> Kinship live</p><h2>Here with you, {elderName ?? "Eleanor"}</h2></div>
            <button onClick={() => setImmersive(false)} className="live-minimize" aria-label="Minimize live call"><XIcon className="w-6 h-6" /><span>Minimize</span></button>
          </header>
          <main className="live-immersive-stage">
            <div className="live-face-wrap"><div className="live-ripple live-ripple-one" /><div className="live-ripple live-ripple-two" /><NovaFace phase={livePhase} expression={expression} size={480} /></div>
            <div className="live-status"><span>{PHASE_LABEL[livePhase]}</span><span aria-hidden="true">·</span><span>{fmt(seconds)}</span></div>
            <p className="live-caption" aria-live="polite">{caption ? `“${caption}”` : conversation.status === "connecting" ? "Just a moment, I’m joining you." : "I’m right here. Take your time."}</p>
          </main>
          <footer className="live-immersive-controls">
            {conversation.status === "connected" && (
              <div className="live-type-row"><input value={text} onChange={(event) => { setText(event.target.value); conversation.sendUserActivity(); }} onKeyDown={(event) => event.key === "Enter" && sendText()} placeholder="You can type here too…" aria-label="Message Kinship" /><button onClick={sendText}>Send</button></div>
            )}
            <button onClick={end} className="live-end"><PhoneIcon className="w-8 h-8" /><span>End call</span></button>
            <p>You can speak naturally and interrupt at any time.</p>
          </footer>
        </div>
      )}
    </>
  );
}

export function ElevenAgentPanel(props: Props) {
  const lastMessage = useRef("");
  const callbacks = useMemo(() => ({
    onConnect: ({ conversationId }: { conversationId: string }) => { props.onPhase?.("listening"); props.onTool?.(`connected:${conversationId}`); },
    onDisconnect: () => props.onPhase?.("idle"),
    onError: (message: string) => { props.onPhase?.("idle"); props.onTool?.(`error:${message}`); },
    onModeChange: ({ mode }: { mode: "speaking" | "listening" }) => props.onPhase?.(mode === "speaking" ? "speaking" : "listening"),
    onMessage: (event: { message: string; role?: string; source?: string }) => {
      const text = String(event.message ?? "").trim();
      if (!text) return;
      const key = `${event.role ?? event.source}:${text}`;
      if (key === lastMessage.current) return;
      lastMessage.current = key;
      props.onMessage(event.role === "user" || event.source === "user" ? "elder" : "agent", text);
    },
    onInterruption: () => props.onTool?.("barge-in: agent interrupted"),
    onAgentToolRequest: (event: unknown) => { const tool = event as { tool_name?: string; name?: string }; props.onTool?.(tool.tool_name ?? tool.name ?? "agent tool"); },
  }), [props]);

  const clientTools = useMemo(() => ({
    open_caregiver_decision_queue: async ({ reason }: { reason?: string }) => {
      window.open("/family?focus=decisions", "_blank", "noopener,noreferrer");
      return `Caregiver decision queue opened${reason ? ` for ${reason}` : ""}. The caregiver must approve before anything is booked.`;
    },
  }), []);

  return <ConversationProvider {...callbacks} clientTools={clientTools} serverLocation="us"><AgentControls {...props} /></ConversationProvider>;
}
