"use client";

import { useMemo, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

type LiveRole = "agent" | "elder";

type Props = {
  elderName?: string;
  dynamicContext?: Record<string, string | number | boolean>;
  onMessage: (role: LiveRole, text: string) => void;
  onPhase?: (phase: "idle" | "connecting" | "listening" | "speaking") => void;
  onTool?: (name: string) => void;
};

function AgentControls({ elderName, dynamicContext, onMessage, onPhase, onTool }: Props) {
  const conversation = useConversation();
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

  const start = () => {
    if (!agentId) {
      setNotice("Add NEXT_PUBLIC_ELEVENLABS_AGENT_ID to turn on the live agent. Browser voice fallback is still available.");
      return;
    }
    setNotice("");
    onPhase?.("connecting");
    conversation.startSession({
      agentId,
      userId: "eleanor-79",
      dynamicVariables: {
        elder_name: elderName ?? "Eleanor",
        user_id: "eleanor-79",
        current_time: new Date().toLocaleString(),
        ...dynamicContext,
      },
    });
  };

  const sendText = () => {
    const value = text.trim();
    if (!value || conversation.status !== "connected") return;
    conversation.sendUserMessage(value);
    setText("");
  };

  const statusText = conversation.status === "connected"
    ? conversation.isSpeaking ? "Kinship is speaking — interrupt anytime" : "Listening in real time"
    : conversation.status === "connecting" ? "Opening a secure voice session…" : "Ready for a live ElevenAgents session";

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-fuchsia-500/10 p-5 shadow-[0_18px_70px_rgba(34,211,238,0.12)] ring-1 ring-white/10">
      <div className="absolute -right-14 -top-16 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${conversation.status === "connected" ? "bg-emerald-300 shadow-[0_0_14px_#6ee7b7]" : "bg-cyan-300"}`} />
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">ElevenAgents live voice</p>
          </div>
          <p className="mt-2 text-lg font-bold text-white">A real conversation, not push-to-talk</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-300">Low-latency turn-taking, barge-in interruption, dynamic Eleanor context, and native ElevenLabs call history.</p>
        </div>
        {conversation.status === "connected" ? (
          <button onClick={() => { conversation.endSession(); onPhase?.("idle"); }} className="rounded-xl bg-rose-500/90 px-4 py-2 text-sm font-extrabold text-white shadow-lg shadow-rose-950/30 hover:bg-rose-400">End live session</button>
        ) : (
          <button onClick={start} disabled={conversation.status === "connecting"} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:-translate-y-0.5 hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60">Start live voice</button>
        )}
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300">
        <span className="rounded-full bg-white/10 px-3 py-1.5">{statusText}</span>
        <span className="rounded-full bg-white/10 px-3 py-1.5">Interruptible</span>
        <span className="rounded-full bg-white/10 px-3 py-1.5">Context-aware</span>
      </div>
      {conversation.status === "connected" && (
        <div className="relative mt-4 flex gap-2">
          <input value={text} onChange={(e) => { setText(e.target.value); conversation.sendUserActivity(); }} onKeyDown={(e) => e.key === "Enter" && sendText()} placeholder="Type to the live agent…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50" />
          <button onClick={sendText} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20">Send</button>
        </div>
      )}
      {notice && <p className="relative mt-3 rounded-xl bg-amber-300/10 px-3 py-2 text-sm leading-5 text-amber-100 ring-1 ring-amber-300/20">{notice}</p>}
    </div>
  );
}

export function ElevenAgentPanel(props: Props) {
  const lastMessage = useRef("");
  const callbacks = useMemo(() => ({
    onConnect: ({ conversationId }: { conversationId: string }) => {
      props.onPhase?.("listening");
      props.onTool?.(`connected:${conversationId}`);
    },
    onDisconnect: () => props.onPhase?.("idle"),
    onError: (message: string) => {
      props.onPhase?.("idle");
      props.onTool?.(`error:${message}`);
    },
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
    onAgentToolRequest: (event: unknown) => {
      const tool = event as { tool_name?: string; name?: string };
      props.onTool?.(tool.tool_name ?? tool.name ?? "agent tool");
    },
  }), [props]);

  const clientTools = useMemo(() => ({
    open_caregiver_decision_queue: async ({ reason }: { reason?: string }) => {
      window.open("/family?focus=decisions", "_blank", "noopener,noreferrer");
      return `Caregiver decision queue opened${reason ? ` for ${reason}` : ""}. The caregiver must approve before anything is booked.`;
    },
  }), []);

  return (
    <ConversationProvider {...callbacks} clientTools={clientTools} serverLocation="us">
      <AgentControls {...props} />
    </ConversationProvider>
  );
}
