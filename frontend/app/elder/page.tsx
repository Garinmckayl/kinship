"use client";
import { useEffect, useRef, useState } from "react";
import { BorderBeam } from "border-beam";
import { PHASE_LABEL, type AgentPhase } from "@/components/AgentOrb";
import { NovaFace, type NovaFaceName } from "@/components/NovaFace";
import { BeamInput } from "@/components/BeamInput";
import { CallScreen, IncomingCall } from "@/components/CallScreen";
import { Markdown } from "@/components/Markdown";
import { Nav } from "@/components/Nav";
import { ElevenAgentPanel } from "@/components/ElevenAgentPanel";
import { attachMotion, fakePulse, stopMotion } from "@/components/voiceMotion";
import { BellIcon, ChatIcon, CheckIcon, ClockIcon, HeartIcon, MicIcon, PhoneIcon } from "@/components/icons";

const TOOL_LABELS: Record<string, string> = {
  get_med_schedule: "Checking your schedule…",
  confirm_intake: "Logging your pill…",
  log_mood: "Noting how you feel…",
  retrieve_memory: "Finding a warm memory…",
  notify_family: "Updating your family…",
  summarize_for_doctor: "Preparing your health summary…",
  schedule_task: "Setting that reminder…",
  call_elder: "Reaching your phone…",
};

const API = "/api";
const LOCAL_HISTORY_KEY = "elderlove:conversation:eleanor-79";
type Msg = { role: "agent" | "elder"; text: string };
type CallMode = "off" | "ringing" | "active";

export default function ElderPage() {
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    const h = new Date().getHours();
    const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    return [{ role: "agent", text: `${greeting} Eleanor \u{1F49C} Did you take your Lisinopril? Tap Yes or just talk to me.` }];
  });
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [callMode, setCallMode] = useState<CallMode>("off");
  const [seconds, setSeconds] = useState(0);
  const [wakeOn, setWakeOn] = useState(false);
  const [toolNote, setToolNote] = useState("");
  const [avatarExpression, setAvatarExpression] = useState<NovaFaceName | undefined>();
  const [historyState, setHistoryState] = useState<"checking" | "synced" | "device">("checking");
  const [today, setToday] = useState<{
    meds: { id: string; name: string; dosage: string; time: string; taken: boolean }[];
    checkedInToday: boolean; tasksPending: number;
    appointmentsToday: { title: string; at: string }[]; done: boolean;
  } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recogRef = useRef<any>(null);
  const wakeRecRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  const callActiveRef = useRef(false);
  callActiveRef.current = callMode === "active";
  const phaseRef = useRef<AgentPhase>("idle");
  phaseRef.current = phase;
  const wakeOnRef = useRef(false);
  wakeOnRef.current = wakeOn;
  const expressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Msg[];
        if (Array.isArray(parsed) && parsed.length) setMsgs(parsed);
      }
    } catch {}
  }, []);
  useEffect(() => {
    fetch(`${API}/caregiver/elder-history`).then((r) => {
      if (!r.ok) throw new Error("not authenticated");
      return r.json();
    }).then((d) => {
      if (d?.messages?.length) {
        setMsgs(d.messages.filter((m: { role: string; content: string }) => m.role !== "system").map((m: { role: string; content: string }) => ({ role: m.role === "user" ? "elder" : "agent", text: m.content })));
        setHistoryState("synced");

      }
    }).catch(() => setHistoryState("device"));
  }, []);
  useEffect(() => {
    if (msgs.length > 1) {
      try { localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(msgs.slice(-80))); } catch {}
    }
  }, [msgs]);

  useEffect(() => {
    return () => {
      try { wakeRecRef.current?.abort(); recogRef.current?.abort(); } catch {}
      if (expressionTimerRef.current) clearTimeout(expressionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, toolNote, phase]);

  useEffect(() => {
    if (callMode !== "active") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callMode]);

  useEffect(() => {
    const load = () => fetch(`${API}/today`).then((r) => r.json()).then(setToday).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [phase]);

  function handleElevenMessage(role: "agent" | "elder", text: string) {
    setMsgs((current) => {
      const last = current[current.length - 1];
      if (last?.role === role && last.text === text) return current;
      return [...current, { role, text }];
    });
    setToolNote("");
  }

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    stopMotion();
  }

  // Streaming chat: tokens render live, tool activity shows, full reply drives voice.
  function showAvatarExpression(next: NovaFaceName, ms = 2400) {
    setAvatarExpression(next);
    if (expressionTimerRef.current) clearTimeout(expressionTimerRef.current);
    expressionTimerRef.current = setTimeout(() => setAvatarExpression(undefined), ms);
  }

  async function send(text: string) {
    if (!text.trim() || streamingRef.current) return;
    streamingRef.current = true;
    stopAudio();
    setMsgs((m) => [...m, { role: "elder", text }]);
    setInput("");
    setPhase("connecting");
    setToolNote("");
    setMsgs((m) => [...m, { role: "agent", text: "" }]);
    const patchLast = (t: string) =>
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "agent", text: t };
        return c;
      });
    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "eleanor-79", message: text }),
      });
      if (!res.ok || !res.body) throw new Error("stream failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      setPhase("thinking");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5));
          if (typeof ev.t === "string") {
            full += ev.t;
            patchLast(full);
          } else if (typeof ev.tool === "string") {
            setToolNote(TOOL_LABELS[ev.tool] ?? "Working…");
          } else if (ev.done) {
            full = ev.full ?? full;
            patchLast(full);
          } else if (ev.error) {
            throw new Error(ev.error);
          }
        }
      }
      setToolNote("");
      const combined = `${text} ${full}`;
      if (/\b(took|yes|done|logged|completed|great|thank you)\b/i.test(combined)) {
        showAvatarExpression("joyful");
      } else if (/\b(chest pain|fall|dizzy|scam|urgent|don't give|do not give)\b/i.test(combined)) {
        showAvatarExpression("concerned", 3000);
      }
      await speak(full || "I'm here with you.");
    } catch {
      patchLast("(offline) Logged with love. Your family is notified only if needed.");
      setToolNote("");
      setPhase("idle");
    } finally {
      streamingRef.current = false;
      fetch(`${API}/today`).then((r) => r.json()).then(setToday).catch(() => {});
    }
  }

  // ElevenLabs voice first, browser TTS fallback. Auto-listens after speaking on calls.
  async function speak(text: string) {
    setPhase("speaking");
    try {
      const res = await fetch(`${API}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok && res.headers.get("Content-Type")?.includes("audio")) {
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setPhase("idle");
          if (callActiveRef.current) voiceInput();
        };
        await audio.play();
        attachMotion(audio);
        return;
      }
    } catch {}
    browserSpeak(text);
  }

  function browserSpeak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.onend = () => {
        setPhase("idle");
        stopMotion();
        if (callActiveRef.current) voiceInput();
      };
      speechSynthesis.speak(u);
      fakePulse();
    } catch {
      setPhase("idle");
    }
  }

  function voiceInput() {
    try { recogRef.current?.abort(); } catch {}
    try { wakeRecRef.current?.abort(); } catch {}
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    setPhase("listening");
    const rec = new SR();
    recogRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e: any) => send(e.results[0][0].transcript);
    rec.onerror = () => {
      setPhase("idle");
      if (wakeOnRef.current) startWakeLoop();
    };
    rec.onend = () => {
      setPhase((p) => (p === "listening" ? "idle" : p));
      if (wakeOnRef.current) startWakeLoop();
    };
    try { rec.start(); } catch {
      setPhase("idle");
      if (wakeOnRef.current) startWakeLoop();
    }
  }

  // Hands-free wake word: Eleanor just says "ElderLove…" from her chair.
  // Browser keyword spotting (free, today). Pro path: Porcupine WASM for iOS reliability.
  function chime() {
    try {
      const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      [880, 1318].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.start(t);
        o.stop(t + 0.16);
      });
    } catch {}
  }

  function startWakeLoop() {
    if (wakeRecRef.current) return; // already listening for the name
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) {
      setWakeOn(false);
      return;
    }
    const rec = new SR();
    wakeRecRef.current = rec;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      if (phaseRef.current !== "idle" || callActiveRef.current) return;
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
      if (/elder\s?love/.test(text.toLowerCase())) {
        try { wakeRecRef.current?.abort(); } catch {}
        wakeRecRef.current = null;
        chime();
        voiceInput();
      }
    };
    rec.onerror = (e: any) => {
      wakeRecRef.current = null;
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") setWakeOn(false);
      else if (wakeOnRef.current && phaseRef.current === "idle") setTimeout(startWakeLoop, 800);
    };
    rec.onend = () => {
      wakeRecRef.current = null;
      if (wakeOnRef.current && phaseRef.current === "idle" && !callActiveRef.current) setTimeout(startWakeLoop, 400);
    };
    try {
      rec.start();
    } catch {
      wakeRecRef.current = null;
      setWakeOn(false);
    }
  }

  function toggleWake() {
    if (wakeOn) {
      setWakeOn(false);
      try { wakeRecRef.current?.abort(); } catch {}
      wakeRecRef.current = null;
    } else {
      setWakeOn(true);
      setTimeout(startWakeLoop, 50);
    }
  }

  function simulateCall() {
    setCallMode("ringing");
    setPhase("idle");
  }

  function acceptCall() {
    setCallMode("active");
    setSeconds(0);
    send("Hello? I just answered your call.");
  }

  function endCall() {
    stopAudio();
    try { recogRef.current?.abort(); speechSynthesis.cancel(); } catch {}
    setCallMode("off");
    setPhase("idle");
  }

  const lastAgent = [...msgs].reverse().find((m) => m.role === "agent")?.text ?? "";

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
      <Nav />
      {callMode === "ringing" && <IncomingCall onAccept={acceptCall} onDecline={() => setCallMode("off")} />}
      {callMode === "active" && (
        <CallScreen
          phase={phase}
          caption={lastAgent}
          seconds={seconds}
          onTalk={voiceInput}
          onEnd={endCall}
          input={input}
          setInput={setInput}
          onSend={() => send(input)}
        />
      )}

      <div className="max-w-xl lg:max-w-6xl mx-auto px-4 pt-6 lg:pt-10 pb-40">
        <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:items-start">
        <div className="flex flex-col items-center text-center gap-3 lg:sticky lg:top-24">
          <BorderBeam size="pulse-outside" colorVariant="ocean" theme="dark">
            <div className="rounded-full bg-indigo-500/10 px-6 py-4">
              <NovaFace phase={phase} expression={avatarExpression} size={240} />
            </div>
          </BorderBeam>
          <h1 className="text-4xl font-bold mt-2 flex items-center gap-2">Hi Eleanor <HeartIcon className="w-8 h-8 text-rose-400" /></h1>
          <p className="text-indigo-200 text-xl">{wakeOn && phase === "idle" ? "Say “ElderLove” — I'm listening" : PHASE_LABEL[phase]}</p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={toggleWake}
              className={`px-6 py-3 rounded-2xl text-white text-xl font-bold flex items-center gap-2 ${wakeOn ? "bg-red-500 animate-pulse" : "bg-slate-700 hover:bg-slate-600"}`}
            >
              <BellIcon className="w-6 h-6" /> {wakeOn ? "Wake word ON" : "Wake word OFF"}
            </button>
          </div>
          <button
            onClick={simulateCall}
            className="mt-2 px-6 py-3 rounded-2xl bg-green-500 hover:bg-green-400 text-white text-xl font-bold shadow-[0_0_30px_rgba(34,197,94,0.5)] flex items-center gap-2"
          >
            <PhoneIcon className="w-6 h-6" /> Simulate morning call
          </button>
        </div>

        <div className="min-w-0">
        <ElevenAgentPanel
          dynamicContext={{
            medication_focus: today?.meds.filter((m) => !m.taken).map((m) => `${m.name} ${m.dosage}`).join(", ") || "No medication due data yet",
            adherence_today: today ? `${today.meds.filter((m) => m.taken).length}/${today.meds.length} doses logged` : "unknown",
            pending_appointments: today?.appointmentsToday.length ?? 0,
            caregiver_decision_url: typeof window === "undefined" ? "/family?focus=decisions" : `${window.location.origin}/family?focus=decisions`,
          }}
          onMessage={handleElevenMessage}
          onPhase={(next) => setPhase(next)}
          onTool={(name) => {
            if (name.startsWith("connected:")) setToolNote("Live ElevenAgents session connected");
            else if (name.startsWith("error:")) setToolNote(name.slice(6));
            else setToolNote(name);
          }}
        />
        {/* Today: quick actions */}
        {today && (
          <div className="mt-6 bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-xl">Today</p>
              {today.done ? (
                <span className="text-emerald-300 font-bold">All done — rest well</span>
              ) : (
                <span className="text-amber-300 font-bold">
                  {today.meds.filter((m) => !m.taken).length} to go
                </span>
              )}
            </div>
            <div className="space-y-2">
              {today.meds.map((m) => (
                <button key={m.id} disabled={m.taken} onClick={() => send(`Yes, I took my ${m.name}`)}
                  className={`w-full flex items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-white/10 ${m.taken ? "bg-emerald-500/10 opacity-70" : "bg-slate-950/60 hover:bg-slate-900"}`}>
                  <span className={`w-9 h-9 rounded-full grid place-items-center font-bold ${m.taken ? "bg-emerald-500" : "bg-white/10"}`}>
                    {m.taken ? <CheckIcon className="w-5 h-5" /> : <ClockIcon className="w-5 h-5" />}
                  </span>
                  <span className="flex-1">
                    <span className="font-bold text-lg">{m.name}</span> <span className="text-slate-300">{m.dosage}</span>
                    <span className="block text-sm text-slate-400">{m.time}{m.taken ? " · taken" : " · tap to log"}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-3 text-sm">
              <span className={`px-3 py-1 rounded-full ${today.checkedInToday ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-slate-300"}`}>
                {today.checkedInToday ? "Checked in" : "Morning check-in pending"}
              </span>
              {today.tasksPending > 0 && <span className="px-3 py-1 rounded-full bg-white/10 text-slate-300">{today.tasksPending} reminder(s) working</span>}
              {today.appointmentsToday.map((a, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-sky-500/20 text-sky-300">
                  Doctor: {a.title} {new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        <div className="flex items-center justify-between mt-8 mb-2">
          <div><p className="text-xs uppercase tracking-[0.22em] text-teal-200 font-bold">Your conversation</p><p className="text-sm text-slate-400">{historyState === "synced" ? "Synced to Kinship history." : "Backed up on this device; caregiver sync appears when signed in."}</p></div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-400/10 text-emerald-200 text-xs font-bold ring-1 ring-emerald-300/20">{historyState === "synced" ? "synced" : "saved"}</span>
        </div>
        <div ref={scrollRef} className="mt-8 space-y-3 max-h-[42vh] overflow-y-auto pr-1">
          {msgs.map((m, i) =>
            m.role === "agent" ? (
              <div key={i} className="bg-white/10 backdrop-blur rounded-3xl p-5 ring-1 ring-white/10">
                <Markdown text={m.text || "…"} large />
              </div>
            ) : (
              <div key={i} className="ml-16 bg-indigo-500 rounded-3xl p-4 text-xl text-right">
                {m.text}
              </div>
            )
          )}
          {toolNote && <p className="text-indigo-300 text-lg animate-pulse">{toolNote}</p>}
        </div>
        </div>
        </div>
      </div>

      {/* Bottom dock */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#050418] via-[#0f0d2e] to-transparent pt-8 pb-4 px-4">
        <div className="max-w-xl lg:max-w-4xl mx-auto space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => send("Yes, I took my morning pill")} className="py-4 rounded-2xl bg-green-500 hover:bg-green-400 text-white text-xl font-bold flex items-center justify-center gap-2">
              <CheckIcon className="w-6 h-6" /> Yes
            </button>
            <button onClick={voiceInput} className={`py-4 rounded-2xl text-white text-xl font-bold flex items-center justify-center gap-2 ${phase === "listening" ? "bg-red-500 animate-pulse" : "bg-indigo-600 hover:bg-indigo-500"}`}>
              <MicIcon className="w-6 h-6" /> Speak
            </button>
            <button onClick={() => send("I feel lonely, can you keep me company?")} className="py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white text-xl font-bold flex items-center justify-center gap-2">
              <ChatIcon className="w-6 h-6" /> Talk
            </button>
          </div>
          <BeamInput value={input} onChange={setInput} onSend={() => send(input)} onMic={voiceInput} micActive={phase === "listening"} />
        </div>
      </div>
    </main>
  );
}
